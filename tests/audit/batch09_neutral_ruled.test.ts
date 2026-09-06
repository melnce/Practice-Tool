/**
 * Batch 9 — Neutral B/C ruled escalations (card text + rulebook).
 * Green here = engine matches our reading; not settled product sign-off.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenBoard,
  thenDeck,
  whenEndTurn,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { drawCard } from "../../src/core/utils.js";
import {
  getCrests,
  getPP,
  getHP,
  getWinner,
  isPlayerDefeated,
  getBanish,
} from "../../src/core/playerHelpers.js";
import { hasKeyword } from "../../src/logic/core/keywords/has.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
    active?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

async function flushAsyncDeckOps(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20));
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("B/C — Olivia super-evolve ally (10104110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare draw 2, restore 2 leader HP, recover 2 PP; Super-Evolve selects unevolved ally", () => {
    setupTurn(R10, {
      hand: ["10104110"],
      pp: 7,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    state.players.first.hp = 15;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "D1")).toBe(true);
    expect(thenHand("first").some((c) => c.name === "D2")).toBe(true);
    expect(getHP(state, "first")).toBe(17);
    expect(getPP(state, "first")).toBe(2);
    const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
    expect(olivia.hasEvolved).toBeFalsy();
    state.players.first.superEvoCharges = 1;
    state.players.first.evoUsedThisTurn = false;
    whenSuperEvolve(olivia, "first");
    resolveFirstPending();
    expect(ally.hasEvolved).toBe(true);
    expect(ally.evoType).toBe("super");
    expect(olivia.evoType).toBe("super");
    expect(olivia.hasEvolved).toBe(true);
  });
});

describe("B/C — Hnikar Enhance + conditional Last Words (10203120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Enhance (5) evolves self; Last Words deals 4 if evolved", () => {
    setupTurn(R6, { hand: ["10203120"], pp: 5 });
    const foe = enemyFollower(2, 6);
    whenPlayCard("first", 0);
    const h = findOnBoard("first", "Hnikar & Jafnhar, Firestorm Duo")!;
    expect(h.hasEvolved).toBe(true);
    expect(getPP(state, "first")).toBe(0);
    h.defense = 0;
    cleanupDead();
    expect(Number(foe.defense)).toBe(2);
    expect(thenBoard("second").length).toBe(1);
  });
});

describe("B/C — enemy_super_evolve hand triggers (10302110, 10303110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("Inspirational One in hand gains Bane when enemy super-evolves", () => {
    setupTurn(R7, { hand: ["10302110"], active: "second" });
    state.players.second.superEvoCharges = 1;
    state.players.second.evoCharges = 2;
    state.players.second.evoUsedThisTurn = false;
    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    applyKeywordsFromList(foe);
    state.players.second.board = [foe];
    whenSuperEvolve(foe, "second");
    const insp = thenHand("first").find((c) => c.name === "Inspirational One")!;
    expect(hasKeyword(insp, "Bane")).toBe(true);
  });

  it("Dogged One in hand gains Storm when enemy super-evolves", () => {
    setupTurn(R7, { hand: ["10303110"], active: "second" });
    state.players.second.superEvoCharges = 1;
    state.players.second.evoCharges = 2;
    state.players.second.evoUsedThisTurn = false;
    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    applyKeywordsFromList(foe);
    state.players.second.board = [foe];
    whenSuperEvolve(foe, "second");
    const dog = thenHand("first").find((c) => c.name === "Dogged One")!;
    expect(hasKeyword(dog, "Storm")).toBe(true);
  });
});

describe("B/C — Tablet deck_duplicates banish (10303210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare banishes deck duplicates and keeps singletons; Engage draws", () => {
    setupTurn(R6, {
      hand: ["10303210"],
      pp: 4,
      deck: [
        { name: "Dup", type: "Follower", attack: 1, defense: 1 },
        { name: "Dup", type: "Follower", attack: 1, defense: 1 },
        { name: "Dup", type: "Follower", attack: 1, defense: 1 },
        { name: "Unique", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    whenPlayCard("first", 0);
    const deck = thenDeck("first");
    expect(deck.filter((c) => c.name === "Dup")).toHaveLength(1);
    expect(deck.filter((c) => c.name === "Unique")).toHaveLength(1);
    expect(deck.length).toBe(2);
    expect(
      getBanish(state, "first").filter((c) => c.name === "Dup"),
    ).toHaveLength(2);
    const tabletIdx = thenBoard("first").findIndex(
      (c) => c.name === "Tablet of Tribulations",
    );
    const deckBeforeEngage = thenDeck("first").length;
    const hand0 = thenHand("first").length;
    engageAmulet("first", tabletIdx);
    expect(thenHand("first").length).toBe(hand0 + 1);
    expect(thenDeck("first").length).toBe(deckBeforeEngage - 1);
  });

  it("Engage with 0 PP is refused — deck size unchanged, no draw", () => {
    setupTurn(R6, {
      hand: ["10303210"],
      pp: 3,
      deck: [{ name: "Unique", type: "Follower", attack: 1, defense: 1 }],
    });
    whenPlayCard("first", 0);
    const tabletIdx = thenBoard("first").findIndex(
      (c) => c.name === "Tablet of Tribulations",
    );
    const deckBefore = thenDeck("first").length;
    const handBefore = thenHand("first").length;
    engageAmulet("first", tabletIdx);
    expect(thenDeck("first").length).toBe(deckBefore);
    expect(thenHand("first").length).toBe(handBefore);
    expect(getPP(state, "first")).toBe(0);
  });

  it("Engage (1) with 1 PP draws 1 and PP drops to 0", () => {
    setupTurn(R6, {
      hand: ["10303210"],
      pp: 4,
      deck: [
        { name: "Unique", type: "Follower", attack: 1, defense: 1 },
        { name: "DrawMe", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    whenPlayCard("first", 0);
    const tabletIdx = thenBoard("first").findIndex(
      (c) => c.name === "Tablet of Tribulations",
    );
    const deckBefore = thenDeck("first").length;
    const handBefore = thenHand("first").length;
    engageAmulet("first", tabletIdx);
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(thenDeck("first").length).toBe(deckBefore - 1);
    expect(getPP(state, "first")).toBe(0);
  });
});

describe("B/C — Mjerrabaine alt-win chain (10304110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve → crest → deck replace → EOT discard/draw 6 → deckout wins", async () => {
    setupTurn(R6, {
      hand: ["10304110"],
      pp: 4,
      deck: [{ name: "Filler", type: "Follower", attack: 1, defense: 1 }],
    });
    state.players.first.evoCharges = 2;
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Great Testimony")).toBe(
      true,
    );
    const mj = findOnBoard("first", "Mjerrabaine, Great Manifest")!;
    whenEvolve(mj, "first");
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Mjerrabaine, Great Manifest",
      ),
    ).toBe(true);
    expect(state.players.first.deckoutWins).toBe(true);
    await flushAsyncDeckOps();
    expect(thenDeck("first").length).toBeGreaterThan(0);
    expect(
      thenDeck("first").every((c) => c.name !== "Mjerrabaine, Great Manifest"),
    ).toBe(true);

    state.players.first.hand.push(
      createCard({ name: "Junk", type: "Spell", cost: 1 }, "hand", "first"),
    );
    whenEndTurn();
    const hand = thenHand("first");
    expect(hand.some((c) => c.name === "Junk")).toBe(false);
    expect(hand.some((c) => c.name === "Great Testimony")).toBe(true);
    expect(hand.length).toBe(7);

    state.players.first.deck.length = 0;
    drawCard(state.players.first.hand, state.players.first.deck, "first");
    expect(isPlayerDefeated(state, "first")).toBe(false);
    expect(isPlayerDefeated(state, "second")).toBe(true);
    expect(getWinner(state)).toBe("first");
  });
});
describe("B/C — Yuni Aura EOT restore (10402110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("end of turn restores 1 defense to all allies", () => {
    setupTurn(R6, { hand: ["10402110"], pp: 3 });
    whenPlayCard("first", 0);
    const yuni = findOnBoard("first", "Yuni, Cosmic Legacy")!;
    yuni.peak_defense = Number(yuni.peak_defense ?? yuni.defense);
    yuni.defense = 1;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    ally.peak_defense = 3;
    ally.defense = 1;
    state.players.first.board.push(ally);
    whenEndTurn();
    expect(yuni.defense).toBe(2);
    expect(ally.defense).toBe(2);
  });
});

describe("B/C — Katalina max damage cap (10401110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Can't take more than 3 damage at a time", () => {
    setupTurn(R6, { hand: ["10401110"], pp: 5 });
    whenPlayCard("first", 0);
    const kat = findOnBoard("first", "Katalina, Sky's Protector")!;
    expect(kat.keywordState?.maxDamageCap ?? 0).toBe(3);
    dealDamage(kat, 5);
    expect(Number(kat.defense)).toBe(2);
    dealDamage(kat, 4);
    expect(Number(kat.defense)).toBe(0);
  });
});

describe("B/C — Gran & Djeeta mode + Skybound Art- (10403110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Mode 1 damages enemy; Skybound Art- self-evolves at 10 witnessed", () => {
    (globalThis as any).HEADLESS = false;
    injectAdapter({
      showChoiceModal: (_opts, cb) => cb(0),
    });
    setupTurn(R10, { hand: ["10403110"], pp: 4 });
    const gran = createCard("10403110", "hand", "first");
    gran.skyboundArtEvolvesWitnessed = 10;
    state.players.first.hand = [gran];
    enemyFollower(2, 8);
    whenPlayCard("first", 0);
    expect(Number(state.players.second.board[0]!.defense)).toBe(3);
    const onBoard = findOnBoard("first", "Gran & Djeeta, Valiant Skyfarers")!;
    expect(onBoard.hasEvolved).toBe(true);
    expect(onBoard.skyboundArtEvolvesWitnessed).toBeGreaterThanOrEqual(10);
  });
});

describe("B/C — Lyria Enhance(8) (10403120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Enhance (8): draws follower cost ≥7 and recovers 7 PP", () => {
    setupTurn(R10, {
      hand: ["10403120"],
      pp: 8,
      deck: [
        { name: "Big", type: "Follower", cost: 8, attack: 8, defense: 8 },
        { name: "Small", type: "Follower", cost: 2, attack: 2, defense: 2 },
      ],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Big")).toBe(true);
    expect(thenDeck("first").some((c) => c.name === "Small")).toBe(true);
    expect(getPP(state, "first")).toBe(7);
    expect(findOnBoard("first", "Lyria, Skydestined")).toBeDefined();
  });
});

describe("B/C — Sandalphon invoke from deck (10404110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Start of turn invoke at 6 evolves: crest + return to hand", () => {
    setupTurn(R6, { hand: [], pp: 6 });
    const sand = createCard("10404110", "deck", "first");
    const fillers = Array.from({ length: 5 }, (_, i) =>
      createCard(
        { name: `F${i}`, type: "Follower", attack: 1, defense: 1, cost: 1 },
        "deck",
        "first",
      ),
    );
    // Draw pops deck tail; Sandalphon stays in deck until invoke after the draw.
    state.players.first.deck = [sand, ...fillers];
    state.players.first.evoCount = 6;
    whenEndTurn();
    whenEndTurn();
    expect(
      thenDeck("first").some(
        (c) => c.name === "Sandalphon, Primarch Successor",
      ),
    ).toBe(false);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Sandalphon, Primarch Successor",
      ),
    ).toBe(true);
    expect(
      thenHand("first").some(
        (c) => c.name === "Sandalphon, Primarch Successor",
      ),
    ).toBe(true);
    expect(thenBoard("first").length).toBe(0);
  });
});
