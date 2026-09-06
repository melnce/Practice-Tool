/**
 * Batch 3 — Abysscraft B/C ruled escalations (card text + owner rulings).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { handleCrest } from "../../src/logic/effects/ops/crest/unified.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleGainCrest, tickCrests } from "../../src/logic/effects/crest.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import {
  getHP,
  getCrests,
  getBoard,
  getModeBonus,
  getHand,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R8 = 8;
const R10 = 10;
const R15 = 15;
const FAITH_CREST = "Faith: Sham-Nacha, Heir to Entwining";

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function bootstrapFaithCrest() {
  handleGainCrest(
    {
      op: "crest",
      action: "gain",
      name: FAITH_CREST,
      counters: { faith: 0 },
      triggers: [
        {
          event: "select_mode",
          condition: { own_turn: true },
          effects: [
            {
              op: "crest",
              action: "add_counter",
              crest: FAITH_CREST,
              counter: "faith",
              amount: 1,
            },
          ],
        },
      ],
    } as any,
    "first",
  );
}

function faithCount(): number {
  const c = getCrests(state, "first").find((x) => x.name === FAITH_CREST);
  return Number(c?.counters?.faith ?? 0);
}

describe("B/C — Ginsetsu mode 2 random destroy (10254110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Mode 2: destroy 4 random enemies; leader +4 (5 enemies → 1 survivor)", () => {
    setupTurn(R10, { pp: 10 });
    for (let i = 0; i < 5; i++) enemyFollower(3, `E${i}`);
    state.players.first.hp = 12;
    const gin = createCard("10254110", "board", "first");
    state.players.first.board = [gin];
    const mode2 = (getCardById("10254110")!.fanfare![0] as any).options[1];
    runEffects(mode2.effects, "first", gin);
    expect(getBoard(state, "second").length).toBe(1);
    expect(getHP(state, "first")).toBe(16);
  });
});

describe("B/C — Screaming and Loathing (10353310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Select 2 modes: recover 1 PP and draw a follower (modes 1 + 2)", () => {
    setupTurn(R6, { pp: 4 });
    // Controlled deck: draw-follower must find this card (no filler pads).
    state.players.first.deck = [
      createCard(
        {
          name: "DeckFollower",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
        },
        "deck",
        "first",
      ),
    ];
    const modeBlock = getCardById("10353310")!.spell![0] as any;
    expect(modeBlock.select).toBe(2);
    runEffects(modeBlock.options[0].effects, "first", null);
    runEffects(modeBlock.options[1].effects, "first", null);
    expect(state.players.first.pp).toBe(5);
    expect(getHand(state, "first").some((c) => c.name === "DeckFollower")).toBe(
      true,
    );
  });

  // Preflight must not treat mode `select` as a targeting select (bible Faith/Modes;
  // Screaming is the only card using select instead of select_count on mode).
  it("can be played from hand when enemy followers are on board (mode select ≠ target)", () => {
    setupTurn(R6, { hand: ["10353310"], pp: 3 });
    state.players.second.board = [
      createCard(
        { name: "Enemy", type: "Follower", cost: 1, attack: 1, defense: 3 },
        "board",
        "second",
      ),
    ];
    const card = getHand(state, "first")[0]!;
    const pre = canPlayCard(card, "first");
    expect(pre.ok).toBe(true);
    whenPlayCard("first", 0);
    expect(getHand(state, "first").some((c) => c.id === "10353310")).toBe(
      false,
    );
  });
});

describe("B/C — Baal filter not_self on random ally buff (10452130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  // Object filter:{not_self:true} must reach getPool (same root cause as Mari filter).
  it("Mode 1: self +1/+1 and another random allied follower +1/+1 (not self twice)", () => {
    setupTurn(R6, { pp: 3 });
    const baal = createCard("10452130", "board", "first");
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [baal, ally];
    const mode1 = (getCardById("10452130")!.fanfare![0] as any).options[0];
    const baalAtk = Number(baal.attack);
    const allyAtk = Number(ally.attack);
    runEffects(mode1.effects, "first", baal);
    expect(Number(baal.attack)).toBe(baalAtk + 1);
    expect(Number(ally.attack)).toBe(allyAtk + 1);
  });
});

describe("B/C — Nezha EOT random hits (10452110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("End of turn: 4 then 2 to random enemies (independent rolls)", () => {
    setupTurn(R8, { hand: ["10452110"], pp: 6 });
    enemyFollower(6, "A");
    enemyFollower(6, "B");
    whenPlayCard("first", 0);
    const nezha = findOnBoard("first", "Nezha, Soaring War God")!;
    const a = state.players.second.board[0]!;
    const b = state.players.second.board[1]!;
    const defBefore = a.defense + b.defense;
    runEffects((nezha.triggers![0] as any).effects, "first", nezha);
    expect(a.defense + b.defense).toBeLessThan(defBefore);
    expect(defBefore - (a.defense + b.defense)).toBe(6);
  });
});

describe("B/C — Corruption dual crest + SSA (10453310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Both leaders gain crest; EOT deals 2 to holder each turn; SSA destroys own crest only", () => {
    setupTurn(R15, { hand: ["10453310"], pp: 6 });
    const spell = getHand(state, "first")[0]!;
    for (let i = 0; i < 5; i++) incrementSkyboundArt("first");
    spell.skyboundArtEvolvesWitnessed = 5;
    state.players.first.hp = 20;
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "second").some((c) => c.name?.includes("Corruption")),
    ).toBe(true);
    expect(getCrests(state, "first").length).toBe(0);

    givenGameState({ seed: 2, activePlayer: "first", roundCount: 6 })
      .withFirstHP(20, 20)
      .build();
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Crest: Corruption",
        countdown: 4,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "damage", target: "ally:leader", amount: 2 }],
          },
        ],
      } as any,
      "first",
    );
    for (let i = 0; i < 4; i++) {
      whenEndTurn();
      state.activePlayer = "first";
      tickCrests("first");
    }
    expect(getHP(state, "first")).toBe(12);
  });
});

describe("B/C — Sham-Nacha faith + super-evolve (10354110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Fanfare at 10 Faith: mode_bonus +1 and faith −10; below 10 pays nothing", () => {
    setupTurn(R6, { hand: ["10351110", "10351110"], pp: 6 });
    bootstrapFaithCrest();
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(2);
    getCrests(state, "first")[0]!.counters = { faith: 10 };
    handleCrest(getCardById("10354110")!.fanfare![0] as any, {
      owner: "first",
    });
    expect(faithCount()).toBe(0);
    expect(getModeBonus(state, "first")).toBe(1);

    resetUidCounter();
    setupTurn(R6, { hand: ["10354110"], pp: 3 });
    bootstrapFaithCrest();
    const faithCrest = getCrests(state, "first")[0]!;
    faithCrest.counters = { faith: 9 };
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(9);
    expect(getModeBonus(state, "first")).toBe(0);
  });

  it("Super-evolve destroys enemy and adds copy to hand", () => {
    setupTurn(R10, { hand: ["10354110"], pp: 10 });
    const sham = createCard("10354110", "board", "first");
    applyKeywordsFromList(sham);
    sham.peak_defense = sham.defense;
    const prey = enemyFollower(4, "Prey");
    state.players.first.board = [sham];
    state.players.first.evoPoints = 2;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(sham, "first");
    resolvePendingTarget(String(prey.uid));
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getHand(state, "first").some((c) => c.name === "Prey")).toBe(true);
  });

  it("Super-evolve hand-copy starts at 0 skybound witnesses (not source's)", () => {
    setupTurn(R10, { hand: ["10354110"], pp: 10 });
    const sham = createCard("10354110", "board", "first");
    applyKeywordsFromList(sham);
    sham.peak_defense = sham.defense;
    const prey = enemyFollower(4, "Prey");
    // Accrued while the enemy held / fielded the original — must not transfer.
    prey.skyboundArtEvolvesWitnessed = 5;
    prey.hasAttacked = true;
    prey.attacks_left = 0;
    prey.isDamaged = true;
    prey.defense = 2;
    prey.peak_defense = 4;
    state.players.first.board = [sham];
    state.players.first.evoPoints = 2;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(sham, "first");
    resolvePendingTarget(String(prey.uid));
    const copy = getHand(state, "first").find((c) => c.name === "Prey");
    expect(copy).toBeTruthy();
    expect(copy!.skyboundArtEvolvesWitnessed ?? 0).toBe(0);
    expect(copy!.owner).toBe("first");
    expect(copy!.zone).toBe("hand");
    expect(copy!.hasAttacked ?? false).toBe(false);
    expect(copy!.isDamaged ?? false).toBe(false);
    expect(copy!.defense).toBe(4);
  });
});

describe("B/C — Belial SSA crest (10454120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("SSA at gauge ≥15 grants Countdown(4) LW 20; super-evolve advances countdown; below 15 no crest", () => {
    setupTurn(R15, { hand: ["10454120"], pp: 8 });
    const belialHand = getHand(state, "first")[0]!;
    for (let i = 0; i < 5; i++) incrementSkyboundArt("first");
    belialHand.skyboundArtEvolvesWitnessed = 5;
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) =>
        c.name?.includes("Belial, Archangel"),
      ),
    ).toBe(true);

    const onBoard = findOnBoard("first", "Belial, Archangel of Cunning")!;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(onBoard, "first");
    const crest = getCrests(state, "first").find((c) =>
      c.name?.includes("Belial, Archangel"),
    )!;
    expect(crest.countdown).toBe(3);

    resetUidCounter();
    setupTurn(R8, { hand: ["10454120"], pp: 8 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) =>
        c.name?.includes("Belial, Archangel"),
      ),
    ).toBe(false);
  });
});
