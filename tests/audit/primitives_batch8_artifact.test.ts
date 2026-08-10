/**
 * Batch 8 — Artifact trait, tokens, hand/deck feed, fuse transform/waste (Portal).
 * Grounded in printed text + engine paths in fuse.artifact.ts / summon_ops/hand.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  fuse_finalize_alpha,
  fuse_finalize_fortifier,
  fuse_finalize_gear_multi,
} from "../../src/logic/effects/ops/fuse/fuse.artifact.js";
import { getShadows } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

/** Canonical Artifact-token family from cards/token_details.json */
const ARTIFACT_TOKEN_IDS = [
  "90071210", // Gear of Ambition
  "90071220", // Gear of Remembrance
  "90072110", // Striker Artifact
  "90072120", // Fortifier Artifact
  "90073110", // Ominous Artifact α
  "90073120", // Ominous Artifact β
  "90073130", // Ominous Artifact γ
  "90074110", // Masterwork Artifact Ω
];

function setupTurn(round: number, opts: { hand?: string[]; pp?: number } = {}) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
}

describe("Artifact tokens — data inventory", () => {
  it("eight Artifact-trait cards in token_details (Gears + followers + Ω)", () => {
    for (const id of ARTIFACT_TOKEN_IDS) {
      const c = getCardById(id);
      expect(c, id).toBeDefined();
      expect(c!.tribes).toContain("Artifact");
    }
  });
});

describe("Artifact feed — real play adds Gears to hand", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Artifact Recharge adds Gear of Ambition and Gear of Remembrance", () => {
    setupTurn(R6, { hand: ["10171320"], pp: 1 });
    whenPlayCard("first", 0);
    const names = thenHand("first").map((c) => c.name);
    expect(names).toContain("Gear of Ambition");
    expect(names).toContain("Gear of Remembrance");
  });

  it("Gears have cant_play — fuse-only, not cast from hand", () => {
    const ambition = createCard("90071210", "hand", "first");
    const remembrance = createCard("90071220", "hand", "first");
    expect(canPlayCard(ambition, "first").ok).toBe(false);
    expect(canPlayCard(remembrance, "first").ok).toBe(false);
  });
});

describe("Portal fuse — transform results (no Loot draw)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Gear of Ambition + Gear of Remembrance → Striker Artifact; partners leave hand; no shadows", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(6, 6)
      .build();
    const shadowsBefore = getShadows(state, "first");
    const host = createCard("90071210", "hand", "first");
    const partner = createCard("90071220", "hand", "first");
    state.players.first.hand = [host, partner];

    fuse_finalize_gear_multi("first", host.uid, [partner], "Striker Artifact");

    expect(thenHand("first").map((c) => c.name)).toEqual(["Striker Artifact"]);
    expect(getShadows(state, "first")).toBe(shadowsBefore);
    expect(thenHand("first")[0]!.fuse_recipes).toBeUndefined();
  });

  it("Fortifier fuse: partner total cost 2 → Ominous Artifact β", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(6, 6)
      .build();
    const fortifier = createCard("90072120", "hand", "first");
    const gear1 = createCard("90071210", "hand", "first");
    const gear2 = createCard("90071220", "hand", "first");
    state.players.first.hand = [fortifier, gear1, gear2];

    fuse_finalize_fortifier("first", fortifier.uid, [gear1, gear2]);

    expect(thenHand("first")[0]!.name).toBe("Ominous Artifact β");
    expect(thenHand("first").length).toBe(1);
  });

  it("Ominous α + β + γ → Masterwork Artifact Ω", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(6, 6)
      .build();
    const alpha = createCard("90073110", "hand", "first");
    const beta = createCard("90073120", "hand", "first");
    const gamma = createCard("90073130", "hand", "first");
    state.players.first.hand = [alpha, beta, gamma];

    fuse_finalize_alpha("first", alpha.uid, [beta, gamma]);

    expect(thenHand("first").map((c) => c.name)).toEqual([
      "Masterwork Artifact Ω",
    ]);
  });

  it("Ominous α fuses only β (waste): α remains, β consumed, no Ω", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(6, 6)
      .build();
    const alpha = createCard("90073110", "hand", "first");
    const beta = createCard("90073120", "hand", "first");
    state.players.first.hand = [alpha, beta];

    fuse_finalize_alpha("first", alpha.uid, [beta]);

    expect(thenHand("first").map((c) => c.name)).toEqual([
      "Ominous Artifact α",
    ]);
    expect(state.lastFuse?.result_name).toBe("wasted");
  });
});

describe("Artifact hand ops — Flight of Icarus + summon copy", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Flight of Icarus grants Rush and Last Words draw on selected Artifact in hand", () => {
    setupTurn(R6, {
      hand: ["10272310", "90072110"],
      pp: 2,
      deck: ["10171320"],
    });
    const striker = thenHand("first").find(
      (c) => c.name === "Striker Artifact",
    )!;
    whenPlayCard("first", 0);
    resolvePendingTarget(striker.uid);
    const updated = thenHand("first").find((c) => c.uid === striker.uid)!;
    expect(updated.hasRush || updated.keywordState?.hasRush).toBe(true);
    const lw =
      updated.lastwords ?? updated.keywordState?.lastwordsEffects ?? [];
    const hasDrawLw = Array.isArray(lw)
      ? lw.some((e: { op?: string }) => e?.op === "draw")
      : false;
    expect(
      hasDrawLw || (updated as { hasLastWords?: boolean }).hasLastWords,
    ).toBe(true);
  });

  it("Dirk Fanfare summons Fortifier Artifact from real play", () => {
    setupTurn(R6, { hand: ["10171120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Fortifier Artifact"),
    ).toBe(true);
  });
});
