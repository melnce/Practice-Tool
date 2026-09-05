/**
 * Rulebook L2 — turn structure, resources, zones and trigger order.
 * Spec: docs/svwb_rulebook_formatted.md lines 54–252.
 * Assert rulebook + owner-rulings behaviour; mark engine gaps with it.fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenEndTurn,
  whenRunEffects,
  thenHand,
  thenBoard,
  thenDeck,
} from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import * as effectsIndex from "../../src/logic/core/effects/index.js";
import { drawCard } from "../../src/core/utils.js";
import {
  getBoard,
  getHP,
  getMaxPP,
  getPP,
  getShadows,
  getWinner,
  isPlayerDefeated,
  setEvoCharges,
  setSuperEvoCharges,
  setEvoUsedThisTurn,
  setMaxPP,
  setPP,
  setHP,
} from "../../src/core/playerHelpers.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { canEvolve, onEvolve } from "../../src/logic/evolveUtils.js";
import {
  runEndOfTurnBoundary,
  runStartOfTurnBoundary,
} from "../../src/logic/core/turnBoundary.js";
import {
  fireTrigger,
  registerRunEffects,
} from "../../src/logic/core/triggers.js";
import {
  toggleSecondPlayerBonusPp,
  canToggleSecondPlayerBonusPp,
} from "../../src/core/bonusPp.js";
import {
  confirmMulliganCore,
  startFirstTurnCore,
} from "../../src/logic/core/mulliganCore.js";
import { loadDecksFromRaw } from "../../src/data/deckLoader.js";
import type { RawDeck } from "../../src/data/rawDeck.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import type { CardInstance, Player } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillerHand(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    attack: 1,
    defense: 1,
  }));
}

function deckFill(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    attack: 1,
    defense: 1,
  }));
}

function eotDamageFollower(
  name: string,
  owner: Player,
  amount: number,
  insertionTs: number,
  whoseTurn: "own" | "opponent" = "own",
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        whoseTurn === "own"
          ? {
              type: "end_of_turn_own",
              effects: [
                { op: "damage", target: "enemy:leader", amount, tag: name },
              ],
            }
          : {
              event: "end_of_turn",
              condition: { whose_turn: "opponent" },
              effects: [
                { op: "restore", target: "ally:leader", amount, tag: name },
              ],
            },
      ],
    },
    "board",
    owner,
  );
  card.insertionTs = insertionTs;
  card.peak_defense = 1;
  return card;
}

function taggedDamage(tag: string, amount = 0) {
  return { op: "damage", target: "enemy:leader", amount, tag };
}

function sotMarkerFollower(
  name: string,
  owner: Player,
  insertionTs: number,
  event: "start_of_turn" | "start_of_turn_own" = "start_of_turn_own",
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        event === "start_of_turn_own"
          ? {
              type: "start_of_turn_own",
              effects: [taggedDamage(name)],
            }
          : {
              event: "start_of_turn",
              condition: { whose_turn: "opponent" },
              effects: [taggedDamage(name)],
            },
      ],
    },
    "board",
    owner,
  );
  card.insertionTs = insertionTs;
  return card;
}

function grantProbeCrest(
  owner: Player,
  name: string,
  event: "start_of_turn_own" | "end_of_turn_own",
  insertionTs: number,
) {
  state.players[owner].crests.push({
    name,
    owner,
    insertionTs,
    triggers: [
      {
        type: event,
        effects: [taggedDamage(name)],
      },
    ],
  } as any);
}

/** Opponent-turn crest: fires on the other player's end-of-turn boundary (rulebook step 3). */
function grantOpponentTurnCrest(
  owner: Player,
  name: string,
  event: "end_of_turn" | "start_of_turn",
  insertionTs: number,
) {
  state.players[owner].crests.push({
    name,
    owner,
    insertionTs,
    triggers: [
      {
        event,
        condition: { whose_turn: "opponent" },
        effects: [taggedDamage(name)],
      },
    ],
  } as any);
}

function recordEffectTags(fn: () => void): string[] {
  const seq: string[] = [];
  const realRunEffects = effectsIndex.runEffects.bind(effectsIndex);
  const spy = vi
    .spyOn(effectsIndex, "runEffects")
    .mockImplementation((effects, owner, sourceCard, context) => {
      for (const eff of effects as any[]) {
        if (eff.tag) seq.push(eff.tag);
      }
      return realRunEffects(effects, owner, sourceCard, context);
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return seq;
}

function readyBoard(owner: Player) {
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = owner;
}

/** 40-card deck used by deckLoader QA tests (same shape as deck-instance-owner). */
const VANILLA_DECK: RawDeck = {
  cards: [
    { name: "Marsh Wyrmling", count: 10 },
    { name: "Scaled Lurker", count: 10 },
    { name: "Dune Scorpion", count: 10 },
    { name: "Mountain Behemoth", count: 10 },
  ],
};

/** Deck loader → both mulligans → first main-phase turn (matches startGame minus fetch). */
function runRealMatchStart(seed = 42) {
  resetUidCounter();
  resetGameState(seed);
  loadDecksFromRaw(VANILLA_DECK, VANILLA_DECK);
  state.phase = "mulligan";
  state.mulliganStage = "first";
  state.mulliganFirstSelected = new Set();
  state.mulliganSecondSelected = new Set();
  state.gameStarted = true;
  confirmMulliganCore("first");
  confirmMulliganCore("second");
}

// ---------------------------------------------------------------------------
// §54–56 Match flow
// ---------------------------------------------------------------------------

describe("Rulebook L54 — Match flow: leaders, decks, opening draw", () => {
  beforeEach(() => resetUidCounter());

  it("fresh player state: leaders begin at 20 defense", () => {
    givenGameState({ seed: 1 }).build();
    expect(state.players.first.hp).toBe(20);
    expect(state.players.first.maxHP).toBe(20);
    expect(state.players.second.hp).toBe(20);
    expect(state.players.second.maxHP).toBe(20);
  });

  it("startFirstTurnCore draws 1 for the first player (WB: both first turns draw)", () => {
    givenGameState({ seed: 1 })
      .withFirstDeck(deckFill("D", 5))
      .withSecondDeck(deckFill("S", 5))
      .build();
    state.phase = "mulligan";
    const handBefore = thenHand("first").length;
    startFirstTurnCore();
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(state.activePlayer).toBe("first");
    expect(state.turnNumber).toBe(1);
  });
});

// Rulebook L148–150 / L60 / L184 — PP initialisation via deck loader + mulligan start path.
describe("Rulebook L148–150 — Real start path: deck loader PP then mulligan", () => {
  beforeEach(() => resetUidCounter());

  it("loadDecksFromRaw + mulligan: turn 1 at 1/1 with 5 cards; second turn 1/1 with 5; round 2 first at 2/2; never 0/0 in main", () => {
    runRealMatchStart(42);

    expect(state.phase).toBe("main");
    expect(state.activePlayer).toBe("first");
    expect(state.turnNumber).toBe(1);
    // deckLoader.ts sets pp/maxPP=1 before opening hand; startFirstTurnCore adds turn-1 draw only.
    expect(getMaxPP(state, "first")).toBe(1);
    expect(getPP(state, "first")).toBe(1);
    expect(thenHand("first").length).toBe(5);
    expect(getPP(state, "first")).not.toBe(0);
    expect(getMaxPP(state, "first")).not.toBe(0);

    whenEndTurn();
    expect(state.activePlayer).toBe("second");
    expect(getMaxPP(state, "second")).toBe(1);
    expect(getPP(state, "second")).toBe(1);
    expect(thenHand("second").length).toBe(5);
    expect(getPP(state, "second")).not.toBe(0);
    expect(getMaxPP(state, "second")).not.toBe(0);

    whenEndTurn();
    expect(state.activePlayer).toBe("first");
    expect(getMaxPP(state, "first")).toBe(2);
    expect(getPP(state, "first")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §58–60 Turn sequence
// ---------------------------------------------------------------------------

describe("Rulebook L58–60 — Turn sequence: PP, draw, alternating turns", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 1 })
      .withFirstDeck(deckFill("F", 20))
      .withSecondDeck(deckFill("S", 20))
      .build();
    readyBoard("first");
  });

  it("ending first turn gives second player 1 max PP refilled and 1 draw", () => {
    const secondHandBefore = thenHand("second").length;
    whenEndTurn();
    expect(state.activePlayer).toBe("second");
    expect(getMaxPP(state, "second")).toBe(1);
    expect(getPP(state, "second")).toBe(1);
    expect(thenHand("second").length).toBe(secondHandBefore + 1);
  });

  it("full turn end runs draw after start-of-turn boundary (hand grows)", () => {
    const deckSizeBefore = thenDeck("second").length;
    const handBefore = thenHand("second").length;
    whenEndTurn();
    expect(thenDeck("second").length).toBe(deckSizeBefore - 1);
    expect(thenHand("second").length).toBe(handBefore + 1);
  });

  it("second player's first turn also draws exactly 1 (not 2)", () => {
    whenEndTurn();
    expect(thenHand("second").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §62–64 Win / loss
// ---------------------------------------------------------------------------

describe("Rulebook L62–64 — Win and loss conditions", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    readyBoard("first");
  });

  it("reducing opponent leader to 0 wins immediately", () => {
    state.players.second.hp = 3;
    applyLeaderDamage("second", 3);
    expect(getHP(state, "second")).toBe(0);
    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("first");
  });

  it("empty deck does not defeat until a draw is attempted", () => {
    state.players.first.deck = [];
    expect(isPlayerDefeated(state, "first")).toBe(false);
    expect(state.phase).not.toBe("gameover");
  });

  it("drawing from empty deck defeats the drawing player", () => {
    state.players.first.deck = [];
    const hpBefore = getHP(state, "first");
    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );
    expect(thenHand("first").length).toBe(0);
    expect(getHP(state, "first")).toBe(hpBefore);
    expect(isPlayerDefeated(state, "first")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §66–75 Zones
// ---------------------------------------------------------------------------

describe("Rulebook L71 — Hand limit 9: burn overflow to shadow", () => {
  beforeEach(() => resetUidCounter());

  it("drawing at 9 cards burns the draw; hand stays at 9; +1 shadow", () => {
    givenGameState({ seed: 1 })
      .withFirstHand(fillerHand("H", 9))
      .withFirstDeck([
        { name: "Tenth", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
    const shadowsBefore = getShadows(state, "first");
    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );
    expect(thenHand("first").length).toBe(9);
    expect(thenHand("first").some((c) => c.name === "Tenth")).toBe(false);
    expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
  });
});

describe("Owner ruling L311 — hand-overflow burn does NOT fire Last Words", () => {
  beforeEach(() => resetUidCounter());

  it("overflow destroy: Last Words damage does not fire", () => {
    givenGameState({ seed: 1 }).withFirstHand(fillerHand("H", 9)).build();
    const burnMe = createCard(
      {
        name: "LWBurn",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        hasLastWords: true,
        lastWordsEffects: [
          { op: "damage", target: "enemy:leader", amount: 5 } as any,
        ],
      },
      "deck",
      "first",
    );
    burnMe.keywordState = {
      lastWordsEffects: [
        { op: "damage", target: "enemy:leader", amount: 5 } as any,
      ],
    };
    state.players.first.deck = [burnMe];
    const enemyHpBefore = getHP(state, "second");
    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );
    expect(getHP(state, "second")).toBe(enemyHpBefore);
    expect(getShadows(state, "first")).toBe(1);
  });
});

describe("Rulebook L72–73 — Field limit 5: excess summons skipped", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
  });

  it("summon 2 with 1 empty slot fills one slot only (inline createCard spec)", () => {
    state.players.first.board = Array.from({ length: 4 }, (_, i) =>
      createCard(
        { name: `Occ${i}`, type: "Follower", attack: 1, defense: 1 },
        "board",
        "first",
      ),
    );
    summonNamed({ op: "summon", name: "Goblin", count: 2 } as any, "first");
    expect(thenBoard("first").length).toBe(5);
    expect(thenBoard("first").filter((c) => c.name === "Goblin").length).toBe(
      1,
    );
  });
});

// ---------------------------------------------------------------------------
// §105–107 Time and priority
// ---------------------------------------------------------------------------

describe("Rulebook L105–107 — No interactive stack; triggers resolve between actions", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).withSecondHP(20).build();
    readyBoard("first");
  });

  it("fireTrigger resolves queued effects before returning (sequential HP drops)", () => {
    const follower = createCard(
      {
        name: "SOTDmg",
        type: "Follower",
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "start_of_turn",
            source: "board",
            effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [follower];
    const hpBefore = getHP(state, "second");
    fireTrigger("start_of_turn", "first", {});
    expect(getHP(state, "second")).toBe(hpBefore - 2);
  });
});

// ---------------------------------------------------------------------------
// §142–180 Turn phases — PP
// ---------------------------------------------------------------------------

describe("Rulebook L184 — PP: begin 0/0, +1 max per turn cap 10, refill, unused wasted", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 1 })
      .withFirstDeck(deckFill("F", 20))
      .withSecondDeck(deckFill("S", 20))
      .build();
    readyBoard("first");
  });

  it("new game player state begins at 0 PP and 0 max PP", () => {
    givenGameState({ seed: 99 }).build();
    expect(getPP(state, "first")).toBe(0);
    expect(getMaxPP(state, "first")).toBe(0);
  });

  it("max PP increases by 1 each turn transition up to cap 10", () => {
    whenEndTurn();
    expect(getMaxPP(state, "second")).toBe(1);
    whenEndTurn();
    expect(getMaxPP(state, "first")).toBe(2);
  });

  it("unused PP does not carry over — refills to max at next turn start", () => {
    setMaxPP(state, "first", 3);
    setPP(state, "first", 3);
    whenEndTurn(); // second's turn
    whenEndTurn(); // first's turn again at round 2 → max 2
    expect(getMaxPP(state, "first")).toBe(2);
    expect(getPP(state, "first")).toBe(2);
  });

  it("beyond turn 10 max PP stays at 10", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstDeck(deckFill("F", 5))
      .withSecondDeck(deckFill("S", 5))
      .build();
    readyBoard("first");
    setMaxPP(state, "first", 10);
    whenEndTurn();
    whenEndTurn();
    expect(getMaxPP(state, "first")).toBe(10);
  });
});

describe("Rulebook L148–149 / L185 — Bonus PP (second player)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "second", roundCount: 3 })
      .withSecondDeck(deckFill("S", 10))
      .withFirstDeck(deckFill("F", 10))
      .build();
    readyBoard("second");
    setMaxPP(state, "second", 3);
    setPP(state, "second", 3);
    state.secondPlayerPPBoostUsedEarly = false;
    state.secondPlayerPPBoostUsedLate = false;
    state.secondPlayerPPBoostPending = false;
  });

  it("second player may activate Bonus PP for +1 usable PP without raising max", () => {
    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(4);
    expect(getMaxPP(state, "second")).toBe(3);
  });

  it("at 10 max PP Bonus PP can push usable PP to 11", () => {
    setMaxPP(state, "second", 10);
    setPP(state, "second", 10);
    state.roundCount = 8;
    state.secondPlayerPPBoostUsedEarly = true;
    state.secondPlayerPPBoostUsedLate = false;
    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(11);
    expect(getMaxPP(state, "second")).toBe(10);
  });

  it("pre-turn-6 early charge is consumed at end of turn if still pending", () => {
    toggleSecondPlayerBonusPp();
    expect(state.secondPlayerPPBoostPending).toBe(true);
    whenEndTurn();
    expect(state.secondPlayerPPBoostUsedEarly).toBe(true);
    expect(state.secondPlayerPPBoostPending).toBe(false);
  });

  it("first player cannot toggle Bonus PP", () => {
    state.activePlayer = "first";
    expect(canToggleSecondPlayerBonusPp()).toBe(false);
    expect(toggleSecondPlayerBonusPp()).toBe(false);
  });
});

describe("Rulebook L184 — Overflow state at max PP ≥ 7 (bonus PP excluded)", () => {
  beforeEach(() => resetUidCounter());

  it("7 max PP is Overflow; 6 is not", () => {
    givenGameState({ seed: 1 }).withFirstPP(6, 6).build();
    expect(isOverflow("first")).toBe(false);
    state.players.first.maxPP = 7;
    expect(isOverflow("first")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §165–187 EP / SEP
// ---------------------------------------------------------------------------

describe("Rulebook L165–168 / L186–187 — Evolution points", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
  });

  function readyFollower(owner: Player) {
    const card = createCard(
      { name: "EvoTarget", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      owner,
    );
    card.peak_defense = 2;
    return card;
  }

  it("first player normal evolve locked before turn 5; unlocked on turn 5", () => {
    const card = readyFollower("first");
    state.players.first.board = [card];
    setEvoCharges(state, "first", 2);
    setEvoUsedThisTurn(state, "first", false);
    state.roundCount = 4;
    expect(canEvolve("first", card, "normal")).toBe(false);
    state.roundCount = 5;
    expect(canEvolve("first", card, "normal")).toBe(true);
  });

  it("second player normal evolve unlocks on turn 4", () => {
    const card = readyFollower("second");
    state.players.second.board = [card];
    setEvoCharges(state, "second", 2);
    setEvoUsedThisTurn(state, "second", false);
    state.roundCount = 3;
    expect(canEvolve("second", card, "normal")).toBe(false);
    state.roundCount = 4;
    expect(canEvolve("second", card, "normal")).toBe(true);
  });

  it("first player super-evolve unlocks on turn 7; second on turn 6", () => {
    const fCard = readyFollower("first");
    const sCard = readyFollower("second");
    setSuperEvoCharges(state, "first", 2);
    setSuperEvoCharges(state, "second", 2);
    setEvoUsedThisTurn(state, "first", false);
    setEvoUsedThisTurn(state, "second", false);

    state.roundCount = 6;
    expect(canEvolve("first", fCard, "super")).toBe(false);
    state.roundCount = 7;
    expect(canEvolve("first", fCard, "super")).toBe(true);

    state.roundCount = 5;
    expect(canEvolve("second", sCard, "super")).toBe(false);
    state.roundCount = 6;
    expect(canEvolve("second", sCard, "super")).toBe(true);
  });

  it("SEP on already-evolved follower is rejected", () => {
    const card = readyFollower("first");
    card.hasEvolved = true;
    card.evoType = "normal";
    setSuperEvoCharges(state, "first", 2);
    setEvoUsedThisTurn(state, "first", false);
    state.roundCount = 7;
    expect(canEvolve("first", card, "super")).toBe(false);
  });

  it("auto-evolve (spendPoint false) sets evolved state without consuming EP", () => {
    const card = readyFollower("first");
    state.players.first.board = [card];
    setEvoCharges(state, "first", 2);
    onEvolve(card, "first", "normal", { spendPoint: false, skipEffects: true });
    expect(card.hasEvolved).toBe(true);
    expect(state.players.first.evoCharges).toBe(2);
    expect(canEvolve("first", card, "normal")).toBe(false);
  });

  it("at most one manual evolve per turn (second attempt blocked)", () => {
    const a = readyFollower("first");
    const b = readyFollower("first");
    b.name = "EvoTargetB";
    state.players.first.board = [a, b];
    setEvoCharges(state, "first", 2);
    setEvoUsedThisTurn(state, "first", false);
    state.roundCount = 5;
    onEvolve(a, "first", "normal", { spendPoint: true, skipEffects: true });
    expect(state.players.first.evoCharges).toBe(1);
    expect(canEvolve("first", b, "normal")).toBe(false);
  });

  it("EP and SEP are not replenished after spending", () => {
    const card = readyFollower("first");
    state.players.first.board = [card];
    setEvoCharges(state, "first", 2);
    setSuperEvoCharges(state, "first", 2);
    state.roundCount = 7;
    onEvolve(card, "first", "normal", { spendPoint: true, skipEffects: true });
    expect(state.players.first.evoCharges).toBe(1);
    whenEndTurn();
    whenEndTurn();
    expect(state.players.first.evoCharges).toBe(1);
    expect(state.players.first.superEvoCharges).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §190–215 Trigger resolution
// ---------------------------------------------------------------------------

describe("Rulebook L196–207 — Eight-category trigger order", () => {
  let effectSpy: ReturnType<typeof vi.fn>;
  const SYNTH = "RULEBOOK_TURNS_SYNTH";

  beforeEach(() => {
    resetUidCounter();
    resetGameState(1);
    state.gameStarted = true;
    state.players.first.board = [];
    state.players.second.board = [];
    state.players.first.hand = [];
    state.players.second.hand = [];
    state.players.first.crests = [];
    state.players.second.crests = [];
    state.players.first.deck = [];
    state.players.second.deck = [];
    state.activePlayer = "first";
    effectSpy = vi.fn();
    registerRunEffects(effectSpy);
  });

  afterEach(() => vi.restoreAllMocks());

  function stub(
    id: number,
    owner: Player,
    zone: "hand" | "board" | "deck",
    tag: string,
  ): CardInstance {
    return {
      uid: `uid-${id}`,
      id,
      name: tag,
      triggers: [
        {
          event: SYNTH,
          source: zone,
          effects: [{ op: "noop", tag }],
        },
      ],
      keywordState: { triggers: [] },
      type: "Follower",
      attack: 1,
      defense: 1,
      cost: 1,
      owner,
      zone,
    } as unknown as CardInstance;
  }

  it("full 8-tier order: active hand → reactive hand → crests → boards → decks", () => {
    state.players.first.hand = [stub(1, "first", "hand", "A_HAND")];
    state.players.second.hand = [stub(2, "second", "hand", "R_HAND")];
    state.players.first.crests = [
      {
        name: "A Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [{ event: SYNTH, effects: [{ op: "noop", tag: "A_CREST" }] }],
      },
    ] as any;
    state.players.second.crests = [
      {
        name: "R Crest",
        owner: "second",
        insertionTs: 1,
        triggers: [
          {
            event: SYNTH,
            condition: { whose_turn: "opponent" },
            effects: [{ op: "noop", tag: "R_CREST" }],
          },
        ],
      },
    ] as any;
    state.players.first.board = [
      Object.assign(stub(3, "first", "board", "A_BOARD"), { insertionTs: 1 }),
    ];
    state.players.second.board = [
      Object.assign(stub(4, "second", "board", "R_BOARD"), { insertionTs: 1 }),
    ];
    state.players.first.deck = [stub(5, "first", "deck", "A_DECK")];
    state.players.second.deck = [stub(6, "second", "deck", "R_DECK")];

    fireTrigger(SYNTH as any, "first", {});

    const tags = effectSpy.mock.calls.map((c) => c[0][0].tag);
    expect(tags).toEqual([
      "A_HAND",
      "R_HAND",
      "A_CREST",
      "A_BOARD",
      "R_CREST",
      "R_BOARD",
      "A_DECK",
      "R_DECK",
    ]);
  });

  it("same-side board tie-break: oldest insertionTs first", () => {
    const old = Object.assign(stub(10, "first", "board", "OLD"), {
      insertionTs: 1,
    });
    const young = Object.assign(stub(11, "first", "board", "YOUNG"), {
      insertionTs: 2,
    });
    state.players.first.board = [young, old];
    fireTrigger(SYNTH as any, "first", {});
    const tags = effectSpy.mock.calls.map((c) => c[0][0].tag);
    expect(tags).toEqual(["OLD", "YOUNG"]);
  });
});

// ---------------------------------------------------------------------------
// §217–252 Turn boundaries
// ---------------------------------------------------------------------------

describe("Rulebook L221–230 — Start-of-turn step order (queue before draw)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstDeck(deckFill("F", 10))
      .build();
    state.gameStarted = true;
  });

  it("SOT boundary resolves active crest → active board → reactive board", () => {
    grantProbeCrest("first", "CrestA", "start_of_turn_own", 1);
    state.players.first.board = [
      sotMarkerFollower("BoardA", "first", 1, "start_of_turn_own"),
    ];
    state.players.second.board = [
      sotMarkerFollower("BoardR", "second", 1, "start_of_turn"),
    ];

    const seq = recordEffectTags(() => runStartOfTurnBoundary("first"));

    expect(seq).toEqual(["CrestA", "BoardA", "BoardR"]);
  });
});

describe("Rulebook L232–240 — End-of-turn step order", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHP(20)
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
  });

  it("EOT boundary: active crest → active board → reactive crest → reactive board", () => {
    grantProbeCrest("first", "CrestA", "end_of_turn_own", 1);
    grantOpponentTurnCrest("second", "CrestR", "end_of_turn", 1);
    state.players.first.board = [
      eotDamageFollower("BoardA", "first", 0, 1, "own"),
    ];
    state.players.second.board = [
      eotDamageFollower("BoardR", "second", 0, 1, "opponent"),
    ];
    (state.players.first.board[0]!.triggers![0] as any).effects[0].tag =
      "BoardA";
    (state.players.second.board[0]!.triggers![0] as any).effects[0].tag =
      "BoardR";

    const seq = recordEffectTags(() => runEndOfTurnBoundary("first"));
    expect(seq).toEqual(["CrestA", "BoardA", "CrestR", "BoardR"]);
  });
});

describe("Rulebook L242 — Bare 'at the end of the turn' fires on both players' EOT", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
  });

  it("bare end_of_turn trigger on first player's follower fires on both EOT boundaries", () => {
    const marker = createCard(
      {
        name: "BareEOT",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "end_of_turn",
            source: "board",
            effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    marker.insertionTs = 1;
    state.players.first.board = [marker];

    const hp0 = getHP(state, "second");
    runEndOfTurnBoundary("first");
    expect(getHP(state, "second")).toBe(hp0 - 1);

    const hp1 = getHP(state, "second");
    runEndOfTurnBoundary("second");
    expect(getHP(state, "second")).toBe(hp1 - 1);
  });
});

describe("Rulebook L246 — EOT worked example: older active follower before newer; opponent restore last", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHP(20)
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
  });

  it("two 'your turn' damage then opponent restore → net 1 damage to opponent leader", () => {
    state.players.first.board = [
      eotDamageFollower("Older", "first", 1, 1, "own"),
      eotDamageFollower("Newer", "first", 1, 2, "own"),
    ];
    state.players.second.board = [
      eotDamageFollower("OppRestore", "second", 1, 1, "opponent"),
    ];
    runEndOfTurnBoundary("first");
    expect(getHP(state, "second")).toBe(19);
  });
});

describe("Rulebook L240 — 'Until end of turn' buffs expire on both leaders' boards at EOT", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 }).build();
    state.gameStarted = true;
  });

  it("temporary board buffs cleared for both players after runEndOfTurnBoundary", () => {
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 2, defense: 2 },
      "board",
      "first",
    );
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 1, attack: 2, defense: 2 },
      "board",
      "second",
    );
    ally.temporaryBuffs = [{ attack: 2, defense: 0, expires: "eot" }];
    enemy.temporaryBuffs = [{ attack: 1, defense: 0, expires: "eot" }];
    ally.attack = 4;
    enemy.attack = 3;
    state.players.first.board = [ally];
    state.players.second.board = [enemy];

    runEndOfTurnBoundary("first");

    expect(Number(ally.attack)).toBe(2);
    expect(Number(enemy.attack)).toBe(2);
  });
});

describe("Owner ruling L244 — Turn-boundary triggers are owner-scoped", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("'start_of_turn_own' crest on both players: only active owner's SOT fires", () => {
    grantProbeCrest("first", "Mine", "start_of_turn_own", 1);
    grantProbeCrest("second", "Theirs", "start_of_turn_own", 1);
    const seq = recordEffectTags(() => runStartOfTurnBoundary("first"));
    expect(seq).toEqual(["Mine"]);
    expect(seq).not.toContain("Theirs");
  });
});

/** Congregant of Disdain (10343110) pattern: trigger.condition.defense_lte on host. */
function congregantStyleHost(defense: number, insertionTs: number) {
  const card = createCard(
    {
      name: "CongregantStyle",
      type: "Follower",
      class: "Dragoncraft",
      cost: 6,
      attack: 5,
      defense,
      triggers: [
        {
          event: "end_of_turn",
          condition: { defense_lte: 3, whose_turn: "owner" },
          effects: [{ op: "draw", source: "deck", count: 1, tag: "cong-eot" }],
        },
      ],
    },
    "board",
    "first",
  );
  card.insertionTs = insertionTs;
  return card;
}

function olderEotAllyFollowerDamage(amount: number, insertionTs: number) {
  const card = createCard(
    {
      name: "OlderDamager",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        {
          type: "end_of_turn_own",
          effects: [
            {
              op: "damage",
              target: "ally:follower",
              amount,
              distribution: "all",
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  card.insertionTs = insertionTs;
  return card;
}

function olderEotAllyFollowerBuff(defense: number, insertionTs: number) {
  const card = createCard(
    {
      name: "OlderBuffer",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        {
          type: "end_of_turn_own",
          effects: [
            {
              op: "stat",
              action: "give",
              target: "ally:follower",
              defense,
              attack: 0,
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  card.insertionTs = insertionTs;
  return card;
}

/** SOT analogue of Congregant — no printed SOT card uses defense_lte; same key as evalCommonConditions. */
function sotDefenseLteHost(defense: number, insertionTs: number) {
  const card = createCard(
    {
      name: "SotConditional",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense,
      triggers: [
        {
          type: "start_of_turn_own",
          condition: { defense_lte: 3 },
          effects: [{ op: "draw", source: "deck", count: 1, tag: "sot-def" }],
        },
      ],
    },
    "board",
    "first",
  );
  card.insertionTs = insertionTs;
  return card;
}

function olderSotAllyFollowerDamage(amount: number, insertionTs: number) {
  const card = createCard(
    {
      name: "OlderSotDamager",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        {
          type: "start_of_turn_own",
          effects: [
            {
              op: "damage",
              target: "ally:follower",
              amount,
              distribution: "all",
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  card.insertionTs = insertionTs;
  return card;
}

describe("Rulebook L252 — EOT trigger.condition snapshots at queue time (Congregant 10343110)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstDeck(deckFill("D", 5))
      .build();
    state.gameStarted = true;
  });

  // Printed: "At the end of your turn, if this follower's defense is 3 or less…" — JSON uses defense_lte: 3.
  // queueTurnBoundaryTriggers calls evalCommonConditions before any resolution.
  it("defense_lte unmet at queue (host 7): older ally damage to 2 same batch does not draw", () => {
    const older = olderEotAllyFollowerDamage(5, 1);
    const host = congregantStyleHost(7, 2);
    state.players.first.board = [older, host];
    const handBefore = thenHand("first").length;

    runEndOfTurnBoundary("first");

    expect(thenHand("first").length).toBe(handBefore);
  });

  it("defense_lte met at queue (host 2): older ally buff before resolve still draws", () => {
    const older = olderEotAllyFollowerBuff(5, 1);
    const host = congregantStyleHost(2, 2);
    state.players.first.board = [older, host];
    const handBefore = thenHand("first").length;

    runEndOfTurnBoundary("first");

    expect(thenHand("first").length).toBe(handBefore + 1);
  });
});

describe("Rulebook L152 — SOT trigger.condition snapshots at queue time", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstDeck(deckFill("D", 5))
      .build();
    state.gameStarted = true;
  });

  // Only Congregant (EOT) and Galleon (super_evolution_unlocked EOT) use non-scoping keys on turn boundaries;
  // SOT uses the same evalCommonConditions path with defense_lte as the analogue.
  it("defense_lte unmet at queue (host 7): older ally damage to 2 same batch does not draw", () => {
    const older = olderSotAllyFollowerDamage(5, 1);
    const host = sotDefenseLteHost(7, 2);
    state.players.first.board = [older, host];
    const handBefore = thenHand("first").length;

    runStartOfTurnBoundary("first");

    expect(thenHand("first").length).toBe(handBefore);
  });

  it("defense_lte met at queue (host 2): older ally buff before resolve still draws", () => {
    const older = olderEotAllyFollowerBuff(5, 1);
    const host = sotDefenseLteHost(2, 2);
    state.players.first.board = [older, host];
    const handBefore = thenHand("first").length;

    runStartOfTurnBoundary("first");

    expect(thenHand("first").length).toBe(handBefore + 1);
  });
});

describe("Authored pattern — leading gate op in trigger effects is judged at queue time", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstDeck(deckFill("D", 5))
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
  });

  // Most "at the end of your turn, if …" cards use a gate op in effects (e.g. Godwood Staff 10113210 combo gate),
  // not trigger.condition — the leading gate is judged when the trigger queues, not when it resolves.
  it("leader_defense_lte gate false at queue: older ally damage before resolve does not draw", () => {
    const older = createCard(
      {
        name: "OlderLeaderHit",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "damage", target: "ally:leader", amount: 8 }],
          },
        ],
      },
      "board",
      "first",
    );
    older.insertionTs = 1;
    const host = createCard(
      {
        name: "GateHost",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "gate",
                condition: "leader_defense_lte",
                count: 15,
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    host.insertionTs = 2;
    state.players.first.board = [older, host];
    expect(getHP(state, "first")).toBe(20);
    const handBefore = thenHand("first").length;

    runEndOfTurnBoundary("first");

    expect(getHP(state, "first")).toBe(12);
    expect(thenHand("first").length).toBe(handBefore);
  });

  it("leader_defense_lte gate true at queue: older ally heal before resolve still draws", () => {
    setHP(state, "first", 5);
    expect(getHP(state, "first")).toBe(5);
    const older = createCard(
      {
        name: "OlderLeaderHeal",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "restore", target: "ally:leader", amount: 20 }],
          },
        ],
      },
      "board",
      "first",
    );
    older.insertionTs = 1;
    const host = createCard(
      {
        name: "GateHost",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "gate",
                condition: "leader_defense_lte",
                count: 10,
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    host.insertionTs = 2;
    state.players.first.board = [older, host];
    const handBefore = thenHand("first").length;

    runEndOfTurnBoundary("first");

    expect(getHP(state, "first")).toBe(20);
    expect(thenHand("first").length).toBe(handBefore + 1);
  });

  function simpleAmulet(name: string, insertionTs: number) {
    const card = createCard(
      { name, type: "Amulet", cost: 1, attack: 0, defense: 0 },
      "board",
      "first",
    );
    card.insertionTs = insertionTs;
    return card;
  }

  // Rings of Moonlight (90064210): "At the end of your turn, if there are at least 3 allied amulets…"
  it("Rings of Moonlight (90064210): 3 amulets at queue, older destroy → damage still happens", () => {
    const older = createCard(
      {
        name: "OlderAmuletDestroy",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "destroy", target: "ally:amulet", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    older.insertionTs = 1;
    const amuletA = simpleAmulet("AmuletA", 2);
    const amuletB = simpleAmulet("AmuletB", 3);
    const rings = createCard("90064210", "board", "first");
    rings.insertionTs = 4;
    state.players.first.board = [older, amuletA, amuletB, rings];
    expect(getHP(state, "second")).toBe(20);

    runEndOfTurnBoundary("first");

    expect(getHP(state, "second")).toBe(17);
  });

  it("Rings of Moonlight (90064210): 2 amulets at queue, older summon → no damage", () => {
    const older = createCard(
      {
        name: "OlderAmuletSummon",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "summon",
                source: "named",
                name: "Serene Sanctuary",
                count: 1,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    older.insertionTs = 1;
    const amuletA = simpleAmulet("AmuletA", 2);
    const rings = createCard("90064210", "board", "first");
    rings.insertionTs = 3;
    state.players.first.board = [older, amuletA, rings];
    expect(getHP(state, "second")).toBe(20);

    runEndOfTurnBoundary("first");

    expect(getHP(state, "second")).toBe(20);
  });
});

describe("Guard — unknown trigger.condition keys", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
  });

  // evalCommonConditions ignores unrecognized keys (returns true); PR #210 used shadows_at_least — not in src/.
  it.fails(
    "unknown trigger.condition key must not silently pass evalCommonConditions",
    () => {
      const follower = createCard(
        {
          name: "BadCondition",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          triggers: [
            {
              type: "start_of_turn_own",
              condition: { shadows_at_least: 999 },
              effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
            },
          ],
        },
        "board",
        "first",
      );
      state.players.first.board = [follower];
      state.players.first.shadows = 0;
      const hpBefore = getHP(state, "second");

      runStartOfTurnBoundary("first");

      expect(getHP(state, "second")).toBe(hpBefore);
    },
  );
});

// ---------------------------------------------------------------------------
// Sabotage-proof anchors (documented in PR)
// ---------------------------------------------------------------------------

describe("Sabotage anchor — hand limit 9", () => {
  it("expects exactly 9 cards after overflow draw", () => {
    givenGameState({ seed: 1 })
      .withFirstHand(fillerHand("H", 9))
      .withFirstDeck([{ name: "X", type: "Follower", attack: 1, defense: 1 }])
      .build();
    drawCard(
      state.players.first.hand as any,
      state.players.first.deck as any,
      "first",
    );
    expect(thenHand("first").length).toBe(9);
  });
});

describe("Sabotage anchor — field limit 5 summon skip", () => {
  it("expects exactly 5 board cards after double summon into 1 slot", () => {
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    state.players.first.board = Array.from({ length: 4 }, (_, i) =>
      createCard(
        { name: `F${i}`, type: "Follower", attack: 1, defense: 1 },
        "board",
        "first",
      ),
    );
    summonNamed({ op: "summon", name: "Goblin", count: 2 } as any, "first");
    expect(thenBoard("first").length).toBe(5);
  });
});
