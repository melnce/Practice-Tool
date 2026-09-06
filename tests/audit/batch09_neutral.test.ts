/**
 * Batch 9 — Neutral non-basic audit (sets 10001–10004; basic Neutral in Batch 1).
 *
 * CLASSIFICATION SUMMARY (29 non-basic Neutral cards):
 * - A (behavioral test): 18 — this file
 * - B/C escalated: 11 → tests/audit/batch09_neutral_ruled.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
  whenEndTurn,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getCrests, getPP, getHP } from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
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

describe("Batch 9 — Neutral [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Ruby — optional hand return to deck then draw 1", () => {
    setupTurn(R6, {
      hand: ["10101110", { name: "ToReturn", type: "Spell", cost: 1 }],
      pp: 2,
      deck: [{ name: "DeckCard", type: "Follower", attack: 1, defense: 1 }],
    });
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenDeck("first").some((c) => c.name === "ToReturn")).toBe(true);
    expect(findOnBoard("first", "Ruby, Greedy Cherub")).toBeDefined();
    expect(thenHand("first").some((c) => c.name === "DeckCard")).toBe(true);
  });

  it("Vigilant Detective — Last Words adds Detective's Lens", () => {
    setupTurn(R6, { hand: ["10101120"], pp: 3 });
    whenPlayCard("first", 0);
    const det = findOnBoard("first", "Vigilant Detective")!;
    det.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Detective's Lens")).toBe(
      true,
    );
  });

  it("Goblin Foray — summons 5 Goblins", () => {
    setupTurn(R6, { hand: ["10101310"], pp: 5 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Goblin")).toHaveLength(
      5,
    );
  });

  it("Apollo — Fanfare 1 to all enemy followers", () => {
    setupTurn(R6, { hand: ["10102110"], pp: 3 });
    const a = enemyFollower(2, 4, "A");
    const b = enemyFollower(2, 3, "B");
    whenPlayCard("first", 0);
    expect(a.defense).toBe(3);
    expect(b.defense).toBe(2);
  });

  it("Apollo — Evolve replicates Fanfare", () => {
    setupTurn(R6, { hand: ["10102110"], pp: 3 });
    enemyFollower(2, 4);
    whenPlayCard("first", 0);
    const apollo = findOnBoard("first", "Apollo, Heaven's Envoy")!;
    state.players.first.evoCharges = 2;
    whenEvolve(apollo, "first");
    expect(state.players.second.board[0]!.defense).toBe(2);
  });

  it("Seraphic Tidings — draws 2", () => {
    setupTurn(R6, {
      hand: ["10102310"],
      pp: 3,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    const n0 = thenHand("first").length;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(n0 + 1);
  });

  it("Phildau — Evolve destroys selected enemy follower", () => {
    setupTurn(R6, { hand: ["10103110"], pp: 2 });
    const foe = enemyFollower(2, 5);
    whenPlayCard("first", 0);
    const ph = findOnBoard("first", "Phildau, Lionheart Ward")!;
    state.players.first.evoCharges = 2;
    whenEvolve(ph, "first");
    resolveFirstPending();
    expect(thenBoard("second").includes(foe)).toBe(false);
  });

  it("Divine Thunder — destroys highest-ATK enemy then 1 to all", () => {
    setupTurn(R6, { hand: ["10103310"], pp: 4 });
    enemyFollower(1, 5, "Low");
    const high = enemyFollower(5, 5, "High");
    const mid = enemyFollower(3, 5, "Mid");
    whenPlayCard("first", 0);
    expect(thenBoard("second").some((c) => c.name === "High")).toBe(false);
    expect(Number(mid.defense)).toBe(4);
    expect(Number(high.defense ?? 0)).toBeLessThanOrEqual(0);
    expect(
      Number(thenBoard("second").find((c) => c.name === "Low")!.defense),
    ).toBe(4);
  });

  it("Ruler of Cocytus — Fanfare replaces deck with Apocalypse Deck", () => {
    setupTurn(R10, { hand: ["10104120"], pp: 10 });
    whenPlayCard("first", 0);
    const deck = thenDeck("first");
    expect(deck.length).toBe(10);
    expect(deck.filter((c) => c.name === "Silent Rider")).toHaveLength(3);
    expect(deck.some((c) => c.name === "Astaroth's Reckoning")).toBe(true);
  });
});

describe("Batch 9 — Neutral [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Twinblade Goblin — super-evolved ally gate deals 4 to selected enemy", () => {
    setupTurn(R7, { hand: ["10201110"], pp: 1 });
    const superAlly = createCard(
      { name: "SuperAlly", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    superAlly.hasEvolved = true;
    superAlly.evoType = "super";
    state.players.first.board.push(superAlly);
    const foe = enemyFollower(2, 6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
  });

  it("Dark Side — gives selected follower +2/-2", () => {
    setupTurn(R6, { hand: ["10201310"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 4 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(2);
  });

  it("Cheretta — Fanfare +0/+3 when super-evolution unlocked", () => {
    setupTurn(R7, { hand: ["10202110"], pp: 2 });
    whenPlayCard("first", 0);
    const ch = findOnBoard("first", "Cheretta, Angelic Maid")!;
    expect(ch.defense).toBe(5);
  });

  it("Reina — Evolve evolves all unevolved allies", () => {
    setupTurn(R7, { hand: ["10203110"], pp: 7 });
    const a = createCard(
      { name: "A", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    const b = createCard(
      { name: "B", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [a, b];
    whenPlayCard("first", 0);
    const reina = findOnBoard("first", "Reina, Angelic Partner")!;
    state.players.first.evoCharges = 2;
    whenEvolve(reina, "first");
    expect(a.hasEvolved).toBe(true);
    expect(b.hasEvolved).toBe(true);
  });

  it("Odin — Fanfare banishes selected enemy card", () => {
    setupTurn(R7, { hand: ["10204110"], pp: 7 });
    enemyFollower(4, 2);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenBoard("second").length).toBe(0);
  });

  it("Grimnir — Fanfare gains Grimnir crest", () => {
    setupTurn(R6, { hand: ["10204120"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Grimnir, Heavenly Gale",
      ),
    ).toBe(true);
  });
});

describe("Batch 9 — Neutral [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Apostle of Voracity — Fanfare +4/-4 on another follower", () => {
    setupTurn(R6, { hand: ["10301110"], pp: 4 });
    const other = createCard(
      { name: "Other", type: "Follower", cost: 2, attack: 1, defense: 3 },
      "board",
      "first",
    );
    state.players.first.board = [other];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(other.attack).toBe(5);
    expect(other.defense).toBeLessThanOrEqual(0);
  });

  it("Greatness Ascended — draws 3; highlander deck recovers 3 PP", () => {
    setupTurn(R6, {
      hand: ["10301310"],
      pp: 4,
      deck: [
        { name: "OnlyA", type: "Follower", attack: 1, defense: 1 },
        { name: "OnlyB", type: "Spell", cost: 1 },
        { name: "OnlyC", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(3);
    expect(getPP(state, "first")).toBe(3);
  });

  it("Gilnelise — Fanfare +2/-2 on another follower", () => {
    setupTurn(R6, { hand: ["10304120"], pp: 3 });
    const other = createCard(
      { name: "Other", type: "Follower", cost: 2, attack: 1, defense: 4 },
      "board",
      "first",
    );
    state.players.first.board = [other];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(other.attack).toBe(3);
    expect(other.defense).toBe(2);
  });
});

describe("Batch 9 — Neutral [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Katalina — Skybound Art- deals 5 to two random enemy followers", () => {
    setupTurn(R10, { hand: ["10401110"], pp: 5 });
    const katalina = createCard("10401110", "hand", "first");
    katalina.skyboundArtEvolvesWitnessed = 10;
    state.players.first.hand = [katalina];
    enemyFollower(2, 8, "E1");
    enemyFollower(2, 8, "E2");
    whenPlayCard("first", 0);
    const defs = thenBoard("second").map((c) => Number(c.defense));
    expect(defs.every((d) => d === 3)).toBe(true);
  });

  it("Vyrn — Fanfare self-evolves when super-evolution unlocked", () => {
    setupTurn(R7, { hand: ["10401120"], pp: 2 });
    whenPlayCard("first", 0);
    const v = findOnBoard("first", "Vyrn, Bestest Pal")!;
    expect(v.hasEvolved).toBe(true);
  });
});
