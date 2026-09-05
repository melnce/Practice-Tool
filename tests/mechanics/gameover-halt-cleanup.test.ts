/**
 * Game-over halt during deferred death flush must still bury corpses and compact
 * boards (#217 regression: null slots after lethal + deferred Last Words).
 */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../mechanics/setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import {
  flushDeferredDeathBatch,
  cleanupDead,
} from "../../src/logic/core/cleanup.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { checkSoakInvariants } from "../../src/bench/soakInvariants.js";
import {
  getBoard,
  getGraveyard,
  getWinner,
} from "../../src/core/playerHelpers.js";
import { render } from "../../src/ui/render.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function assertNoNullBoardSlots() {
  for (const side of ["first", "second"] as const) {
    const board = getBoard(state, side);
    for (let i = 0; i < board.length; i++) {
      expect(board[i]).not.toBeNull();
      expect(board[i]).toBeTruthy();
    }
  }
}

function assertSingleZone(card: { uid: string; zone: string }) {
  const zones: string[] = [];
  for (const side of ["first", "second"] as const) {
    if (getBoard(state, side).some((c) => c?.uid === card.uid))
      zones.push("board");
    if (getGraveyard(state, side).some((c) => c.uid === card.uid))
      zones.push("graveyard");
    if (state.players[side].hand.some((c) => c.uid === card.uid))
      zones.push("hand");
    if (state.players[side].deck.some((c) => c.uid === card.uid))
      zones.push("deck");
  }
  expect(zones).toEqual([card.zone]);
}

function mountRenderDom(): void {
  document.body.innerHTML = `
    <div id="blueHand" class="zone hand-zone"></div>
    <div id="redHand" class="zone hand-zone"></div>
    <div id="blueBoard" class="zone board-zone"></div>
    <div id="redBoard" class="zone board-zone"></div>
    <div id="blueLeader" class="leader"><span id="blueHP">20</span></div>
    <div id="redLeader" class="leader"><span id="redHP">20</span></div>
    <div id="blueHandCount">0</div>
    <div id="redHandCount">0</div>
    <div id="blueDeckCount">0</div>
    <div id="redDeckCount">0</div>
    <div id="blueGraveCount">0</div>
    <div id="redGraveCount">0</div>
    <div id="blueShadows">0</div>
    <div id="redShadows">0</div>
    <div id="bluePP">0</div>
    <div id="redPP">0</div>
    <div id="endTurnBlue" style="display:none"></div>
    <div id="endTurnRed" style="display:none"></div>
    <div id="blueNormalEvo"></div>
    <div id="redNormalEvo"></div>
    <div id="blueSuperEvo"></div>
    <div id="redSuperEvo"></div>
    <div id="boostPips"></div>
    <div id="boostPipEarly"></div>
    <div id="boostPipLate"></div>
    <div id="redBoost"></div>
    <div id="puzzleStatus"></div>
    <div id="scriptStatus"></div>
    <div id="checkpointStatus"></div>
    <div id="gameSeedPanel" hidden></div>
    <div id="gameSeedValue"></div>
    <div id="blueCrests"></div>
    <div id="redCrests"></div>
    <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
  `;
}

describe("game-over halt compacts deferred death batch", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("Chaos Legion lethal: no null board slots, LW buried without drawing", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10473310"])
      .withFirstPP(6, 6)
      .withFirstDeck([
        {
          name: "DeckFodder",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .build();

    const leah = createCard("10001120", "board", "second");
    leah.peak_defense = Number(leah.defense);
    applyKeywordsFromList(leah);
    leah.uid = "lw_follower";
    state.players.second.board = [leah];
    state.players.second.hp = 3;

    const handBefore = thenHand("second").length;

    whenPlayCard("first", 0);

    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("first");
    assertNoNullBoardSlots();
    expect(getGraveyard(state, "second").some((c) => c.uid === leah.uid)).toBe(
      true,
    );
    assertSingleZone(leah);
    expect(thenHand("second").length).toBe(handBefore);
    expect(checkSoakInvariants(state).map((f) => f.message)).toEqual([]);
  });

  it("super-evo knockback lethal: follower buried, board compacted, LW did not draw", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 8 })
      .withFirstPP(10, 10)
      .withSecondDeck([
        {
          name: "DeckFodder",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .build();

    const attacker = createCard(
      {
        name: "Super Striker",
        type: "Follower",
        cost: 3,
        attack: 5,
        defense: 5,
      },
      "board",
      "first",
    );
    attacker.peak_defense = 5;
    attacker.evoType = "super";
    attacker.hasEvolved = true;
    attacker.can_attack = true;
    attacker.attacks_left = 1;
    attacker.justPlayed = false;
    applyKeywordsFromList(attacker);

    const fodder = createCard("10001120", "board", "second");
    fodder.peak_defense = Number(fodder.defense);
    applyKeywordsFromList(fodder);
    fodder.uid = "knockback_lw";

    state.players.first.board = [attacker];
    state.players.second.board = [fodder];
    state.players.second.hp = 1;

    const handBefore = thenHand("second").length;

    (state as any).deferDeathTriggers = true;
    attackFollower(0, 0, "first", "second");
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("first");
    assertNoNullBoardSlots();
    expect(
      getGraveyard(state, "second").some((c) => c.uid === fodder.uid),
    ).toBe(true);
    assertSingleZone(fodder);
    expect(thenHand("second").length).toBe(handBefore);
    expect(checkSoakInvariants(state).map((f) => f.message)).toEqual([]);
  });

  it("lethal leader attack with deferred LW follower: board stays compact", () => {
    givenGameState({ seed: 1, activePlayer: "second", roundCount: R6 })
      .withSecondDeck([
        {
          name: "DeckFodder",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .build();

    const attacker = createCard(
      { name: "Striker", type: "Follower", cost: 2, attack: 3, defense: 2 },
      "board",
      "second",
    );
    attacker.peak_defense = 2;
    attacker.can_attack = true;
    attacker.attacks_left = 1;
    attacker.justPlayed = false;
    applyKeywordsFromList(attacker);

    const lwAlly = createCard("10001120", "board", "first");
    lwAlly.peak_defense = Number(lwAlly.defense);
    applyKeywordsFromList(lwAlly);
    lwAlly.uid = "ally_lw";

    state.players.second.board = [attacker];
    state.players.first.board = [lwAlly];
    state.players.first.hp = 3;
    state.activePlayer = "second";

    const handBefore = thenHand("first").length;

    (state as any).deferDeathTriggers = true;
    dealDamage(lwAlly, Number(lwAlly.defense));
    cleanupDead();
    attackLeader(0, "second", "first");
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("second");
    assertNoNullBoardSlots();
    expect(getGraveyard(state, "first").some((c) => c.uid === lwAlly.uid)).toBe(
      true,
    );
    assertSingleZone(lwAlly);
    expect(thenHand("first").length).toBe(handBefore);
    expect(checkSoakInvariants(state).map((f) => f.message)).toEqual([]);
  });

  it("lethal inside Last Words batch: second corpse buried, its LW suppressed", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10473310"])
      .withFirstPP(6, 6)
      .withSecondDeck([
        {
          name: "DeckFodder",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .build();

    const lethalLw = createCard("10601110", "board", "second");
    lethalLw.peak_defense = Number(lethalLw.defense);
    applyKeywordsFromList(lethalLw);
    lethalLw.uid = "lw_leader_ping";
    (lethalLw as any).insertionTs = 1;

    const drawLw = createCard("10001120", "board", "second");
    drawLw.peak_defense = Number(drawLw.defense);
    applyKeywordsFromList(drawLw);
    drawLw.uid = "lw_draw";
    (drawLw as any).insertionTs = 2;

    state.players.second.board = [lethalLw, drawLw];
    state.players.second.hp = 10;
    state.players.first.hp = 1;

    const handBefore = thenHand("second").length;

    whenPlayCard("first", 0);

    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("second");
    assertNoNullBoardSlots();
    expect(
      getGraveyard(state, "second").some((c) => c.uid === lethalLw.uid),
    ).toBe(true);
    expect(
      getGraveyard(state, "second").some((c) => c.uid === drawLw.uid),
    ).toBe(true);
    assertSingleZone(lethalLw);
    assertSingleZone(drawLw);
    expect(thenHand("second").length).toBe(handBefore);
    expect(checkSoakInvariants(state).map((f) => f.message)).toEqual([]);
  });

  it("damage batch depth does not leak into the next game after a halted lethal", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 8 })
      .withFirstPP(10, 10)
      .build();

    const attacker = createCard(
      {
        name: "Super Striker",
        type: "Follower",
        cost: 3,
        attack: 5,
        defense: 5,
      },
      "board",
      "first",
    );
    attacker.peak_defense = 5;
    attacker.evoType = "super";
    attacker.hasEvolved = true;
    attacker.can_attack = true;
    attacker.attacks_left = 1;
    attacker.justPlayed = false;
    applyKeywordsFromList(attacker);

    const fodder = createCard("10001120", "board", "second");
    fodder.peak_defense = Number(fodder.defense);
    applyKeywordsFromList(fodder);

    state.players.first.board = [attacker];
    state.players.second.board = [fodder];
    state.players.second.hp = 1;

    (state as any).deferDeathTriggers = true;
    attackFollower(0, 0, "first", "second");
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    expect((state as any)._damageBatchDepth ?? 0).toBe(0);

    resetGameState(99);
    state.gameStarted = true;
    state.phase = "main";
    expect((state as any)._damageBatchDepth ?? 0).toBe(0);
  });
});

describe("game-over halt render (jsdom)", () => {
  beforeEach(() => {
    resetUidCounter();
    mountRenderDom();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("render() after Chaos Legion lethal does not throw; dead follower absent; body.gameover", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10473310"])
      .withFirstPP(6, 6)
      .build();

    const leah = createCard("10001120", "board", "second");
    leah.peak_defense = Number(leah.defense);
    applyKeywordsFromList(leah);
    leah.uid = "lw_follower_dom";
    state.players.second.board = [leah];
    state.players.second.hp = 3;

    whenPlayCard("first", 0);

    expect(() => render()).not.toThrow();
    expect(document.body.classList.contains("gameover")).toBe(true);
    expect(
      document
        .querySelector("#redBoard")
        ?.querySelector(`[data-uid="${leah.uid}"]`),
    ).toBeNull();
    expect(thenBoard("second")).toHaveLength(0);
  });
});
