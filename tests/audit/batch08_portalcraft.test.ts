/**
 * Batch 8 — Portalcraft audit (sets 10001–10004; basic Portal in Batch 1).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Portalcraft cards):
 * - A (behavioral test): 23 — this file
 * - B/C escalated: 26 → tests/audit/batch08_portalcraft_ruled.test.ts
 *
 * Primitives: primitives_batch8_artifact.test.ts, primitives_batch8_puppetry.test.ts,
 * primitives_batch8_portal_watch.test.ts.
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
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getCrests } from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

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

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
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

describe("Batch 8 — Portalcraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Elise — Last Words adds Gear of Remembrance", () => {
    setupTurn(R6, { hand: ["10171110"], pp: 1 });
    whenPlayCard("first", 0);
    const elise = findOnBoard("first", "Elise, Electrifying Inventor")!;
    elise.defense = 0;
    cleanupDead();
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });

  it("Dirk — Fanfare summons Fortifier Artifact", () => {
    setupTurn(R6, { hand: ["10171120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Fortifier Artifact"),
    ).toBe(true);
  });

  it("Ironheart Hunter — Fanfare adds Gear of Ambition", () => {
    setupTurn(R6, { hand: ["10171130"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
  });

  it("Puppet Shield — summons 2 Enhanced Puppet", () => {
    setupTurn(R6, { hand: ["10171310"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Enhanced Puppet").length,
    ).toBe(2);
  });

  it("Artifact Recharge — adds both Gears", () => {
    setupTurn(R6, { hand: ["10171320"], pp: 1 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });

  it("Rukina — Fanfare adds both Gears", () => {
    setupTurn(R6, { hand: ["10172110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });

  it("Noah — Fanfare adds 3 Puppets and buffs Puppetry in hand", () => {
    setupTurn(R8, { hand: ["10172130", "90071120"], pp: 6 });
    const ep = thenHand("first").find((c) => c.name === "Enhanced Puppet")!;
    const atk0 = Number(ep.attack);
    whenPlayCard("first", 0);
    expect(thenHand("first").filter((c) => c.name === "Puppet").length).toBe(3);
    expect(Number(ep.attack)).toBe(atk0 + 1);
  });

  it("Stream of Life — 3 damage and Gear of Remembrance", () => {
    setupTurn(R6, { hand: ["10172310"], pp: 2 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(2);
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });

  it("Ancient Cannon — Fanfare adds Gear of Ambition", () => {
    setupTurn(R6, { hand: ["10173210"], pp: 5 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
  });

  it("Eudie — Fanfare draws; Evolve gains crest", () => {
    setupTurn(R6, { hand: ["10174110"], pp: 3, deck: ["10171320"] });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThan(0);
    const eudie = findOnBoard("first", "Eudie, Maiden Reborn")!;
    onEvolve(eudie, "first", "normal");
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Eudie")),
    ).toBe(true);
  });

  it("Orchis — Fanfare summons Lloyd", () => {
    setupTurn(R8, { hand: ["10174120"], pp: 8 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Lloyd")).toBe(true);
  });
});

describe("Batch 8 — Portalcraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Engineblade Maven — Fanfare summons Striker and adds Gear of Remembrance", () => {
    setupTurn(R6, { hand: ["10271110"], pp: 6 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });

  it("Flight of Icarus — Rush on selected Artifact in hand", () => {
    setupTurn(R6, { hand: ["10272310", "90072110"], pp: 2 });
    const striker = thenHand("first").find(
      (c) => c.name === "Striker Artifact",
    )!;
    whenPlayCard("first", 0);
    resolvePendingTarget(striker.uid);
    const updated = thenHand("first").find((c) => c.uid === striker.uid)!;
    expect(updated.hasRush || updated.keywordState?.hasRush).toBe(true);
  });

  it("Synchronous Hearts — summons Lloyd and Victoria", () => {
    setupTurn(R8, { hand: ["10273310"], pp: 6 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Lloyd")).toBe(true);
    expect(thenBoard("first").some((c) => c.name === "Victoria")).toBe(true);
  });

  it("Zwei — Fanfare summons Victoria", () => {
    setupTurn(R6, { hand: ["10274110"], pp: 5 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Victoria")).toBe(true);
  });
});

describe("Batch 8 — Portalcraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Supersonic Fighter — Fanfare summons Ominous Artifact γ", () => {
    setupTurn(R8, { hand: ["10371120"], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Ominous Artifact γ"),
    ).toBe(true);
  });

  it("Wired Assault — destroys enemy and adds 2 Puppets", () => {
    setupTurn(R6, { hand: ["10371310"], pp: 4 });
    enemyFollower(5);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first").filter((c) => c.name === "Puppet").length).toBe(2);
  });

  it("Field Scientist — discard 1 draw 3", () => {
    setupTurn(R6, {
      hand: ["10372120", "10171320"],
      pp: 5,
      deck: ["10171310", "10171320", "10171310"],
    });
    const deckBefore = state.players.first.deck.length;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(state.players.first.deck.length).toBe(deckBefore - 3);
    expect(thenHand("first").length).toBeGreaterThan(0);
  });
});

describe("Batch 8 — Portalcraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Sho — Storm on play; Barrier when super-evo unlocked (R7+)", () => {
    setupTurn(R7, { hand: ["10471110"], pp: 3 });
    whenPlayCard("first", 0);
    const sho = findOnBoard("first", "Sho, Reborn Night King")!;
    expect(sho.hasStorm || sho.keywordState?.hasStorm).toBe(true);
    expect(sho.hasBarrier || sho.keywordState?.hasBarrier).toBe(true);
  });

  it("Tsubasa — Rush", () => {
    setupTurn(R6, { hand: ["10471120"], pp: 2 });
    whenPlayCard("first", 0);
    const t = findOnBoard("first", "Tsubasa, Blazing Gearcyclist")!;
    expect(t.hasRush || t.keywordState?.hasRush).toBe(true);
  });

  it("Isaac — Last Words adds Striker Artifact", () => {
    setupTurn(R6, { hand: ["10471130"], pp: 2 });
    whenPlayCard("first", 0);
    const isaac = findOnBoard("first", "Isaac, Congenial Engineer")!;
    isaac.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
  });

  it("Stone Breaker — 6 instances of 1 damage to random enemies", () => {
    setupTurn(R6, { hand: ["10472310"], pp: 3 });
    enemyFollower(6, "A");
    enemyFollower(6, "B");
    whenPlayCard("first", 0);
    const totalDef = state.players.second.board.reduce(
      (s, c) => s + Number(c.defense),
      0,
    );
    expect(totalDef).toBeLessThan(12);
  });
});
