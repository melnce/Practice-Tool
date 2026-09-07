/**
 * Hand-copy summons from selection prompts must defer enter triggers to the
 * orchestrator (targeting-contract). Repro: New-Age Cartographer Super-Evolve
 * copying Analyzing Artifact — enter draw must fire once without lifecycle guard throw.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { getRally } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const CARTOGRAPHER = "10572110";
const ANALYZING_ARTIFACT = "90071130";
const STRIKER_ARTIFACT = "90072110";
const DOOMWRIGHT_RESURGENCE = "10172320";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const R7 = 7;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
  } = {},
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

describe("hand-copy summon selection — deferred enter triggers", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Cartographer Super-Evolve copying Analyzing Artifact: copy on board, draw once, original in hand, Rally +1, no throw", () => {
    setupTurn(R7, {
      hand: [CARTOGRAPHER, ANALYZING_ARTIFACT],
      deck: [DRAW_TOP, DRAW_SECOND],
      pp: 4,
    });

    whenPlayCard("first", 0);
    const handSizeBefore = thenHand("first").length;
    const deckBefore = thenDeck("first").length;
    const cart = findOnBoard("first", "New-Age Cartographer")!;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(cart, "first");

    const analyzing = thenHand("first").find(
      (c) => c.id === ANALYZING_ARTIFACT,
    )!;
    expect(state.pendingTargetEffect).toBeDefined();
    const rallyBeforeCopy = getRally(state, "first");

    expect(() => resolvePendingTarget(analyzing.uid)).not.toThrow();

    const copies = thenBoard("first").filter(
      (c) => c.name === "Analyzing Artifact",
    );
    expect(copies).toHaveLength(1);
    expect(copies[0]!.uid).not.toBe(analyzing.uid);

    expect(thenHand("first").some((c) => c.uid === analyzing.uid)).toBe(true);
    expect(thenHand("first").length).toBe(handSizeBefore + 1);
    expect(thenDeck("first").length).toBe(deckBefore - 1);
    expect(getRally(state, "first")).toBe(rallyBeforeCopy + 1);
    expect(state.pendingTargetEffect).toBeUndefined();
  });

  it("Cartographer Super-Evolve copying Striker Artifact (no enter trigger): summons without draw", () => {
    setupTurn(R7, {
      hand: [CARTOGRAPHER, STRIKER_ARTIFACT],
      deck: [DRAW_TOP, DRAW_SECOND],
      pp: 4,
    });

    whenPlayCard("first", 0);
    const cart = findOnBoard("first", "New-Age Cartographer")!;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(cart, "first");

    const striker = thenHand("first").find((c) => c.id === STRIKER_ARTIFACT)!;
    expect(() => resolvePendingTarget(striker.uid)).not.toThrow();

    expect(
      thenBoard("first").filter((c) => c.name === "Striker Artifact"),
    ).toHaveLength(1);
    expect(thenHand("first").some((c) => c.uid === striker.uid)).toBe(true);
    expect(thenHand("first").some((c) => c.id === DRAW_TOP)).toBe(false);
  });

  it("Doomwright Resurgence: EOT-destroy copy gets trigger and enter fires once", () => {
    setupTurn(R7, {
      hand: [DOOMWRIGHT_RESURGENCE, ANALYZING_ARTIFACT, STRIKER_ARTIFACT],
      deck: [DRAW_TOP, DRAW_SECOND],
      pp: 5,
    });

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeDefined();

    const deckBefore = thenDeck("first").length;
    const analyzing = thenHand("first").find(
      (c) => c.id === ANALYZING_ARTIFACT,
    )!;
    const striker = thenHand("first").find((c) => c.id === STRIKER_ARTIFACT)!;

    expect(() => resolvePendingTarget(analyzing.uid)).not.toThrow();
    expect(state.pendingTargetEffect).toBeDefined();
    expect(() => resolvePendingTarget(striker.uid)).not.toThrow();

    const copies = thenBoard("first").filter(
      (c) => c.name === "Analyzing Artifact" || c.name === "Striker Artifact",
    );
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      const eot = copy.triggers?.find(
        (t) => (t as any).type === "end_of_turn" || t.event === "end_of_turn",
      );
      expect(eot).toBeDefined();
      expect((eot as any).condition?.whose_turn).toBe("opponent");
    }

    expect(thenDeck("first").length).toBe(deckBefore - 1);
  });
});
