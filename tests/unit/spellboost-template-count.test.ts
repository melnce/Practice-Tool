/**
 * spellboost.count template resolution — Suframare (10431120) and regressions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  whenRunEffects,
  resetUidCounter,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { normalizeToUnifiedSpec as normalizeDrawSpec } from "../../src/logic/effects/ops/draw/types.js";
import { normalizeToUnifiedSpec as normalizeDestroySpec } from "../../src/logic/effects/ops/destroy/types.js";
import "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

const R6 = 6;
const SUFRAMARE = "10431120";
/** Blaze Destroyer — On Spellboost: Reduce the cost of this card by 1. */
const BLAZE_DESTROYER = "10032120";
/** Foresight — draw 1, no Spellboost keyword. */
const FORESIGHT = "10031310";

function sbCount(card: CardInstance | undefined | null): number {
  if (!card) return 0;
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    activePlayer?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.activePlayer ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
}

describe("spellboost templated count — Suframare 10431120", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("EOT at 1 attack: spellboosts hand once", () => {
    setupTurn(R6, { hand: [SUFRAMARE, BLAZE_DESTROYER], pp: 1 });
    whenPlayCard("first", 0);
    const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    const sb0 = sbCount(blaze);
    const cost0 = getEffectiveCost(blaze);
    whenEndTurn();
    const blazeAfter = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    expect(sbCount(blazeAfter) - sb0).toBe(1);
    expect(getEffectiveCost(blazeAfter)).toBe(cost0 - 1);
  });

  it("EOT at 3 attack: spellboosts hand three times", () => {
    setupTurn(R6, { hand: [SUFRAMARE, BLAZE_DESTROYER], pp: 1 });
    whenPlayCard("first", 0);
    const suframare = findOnBoard("first", "Suframare, Wandering Tutor")!;
    whenRunEffects(
      [{ op: "stat", action: "give", target: "self", attack: 2 } as any],
      "first",
      suframare,
    );
    expect(Number(suframare.attack)).toBe(3);
    const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    const sb0 = sbCount(blaze);
    const cost0 = getEffectiveCost(blaze);
    whenEndTurn();
    const blazeAfter = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    expect(sbCount(blazeAfter) - sb0).toBe(3);
    expect(getEffectiveCost(blazeAfter)).toBe(cost0 - 3);
  });

  it("non-Spellboost card in hand is untouched", () => {
    setupTurn(R6, { hand: [SUFRAMARE, FORESIGHT, BLAZE_DESTROYER], pp: 1 });
    whenPlayCard("first", 0);
    const suframare = findOnBoard("first", "Suframare, Wandering Tutor")!;
    whenRunEffects(
      [{ op: "stat", action: "give", target: "self", attack: 2 } as any],
      "first",
      suframare,
    );
    const foresight = thenHand("first").find((c) => c.id === FORESIGHT)!;
    const foresightCost0 = getEffectiveCost(foresight);
    whenEndTurn();
    const foresightAfter = thenHand("first").find((c) => c.id === FORESIGHT)!;
    expect(sbCount(foresightAfter)).toBe(0);
    expect(getEffectiveCost(foresightAfter)).toBe(foresightCost0);
  });

  it("opponent EOT does not trigger owner's Suframare", () => {
    setupTurn(R6, { hand: [SUFRAMARE, BLAZE_DESTROYER], pp: 1 });
    whenPlayCard("first", 0);
    const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    const sb0 = sbCount(blaze);
    whenEndTurn(); // first player's EOT — should boost
    const sb1 = sbCount(
      thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!,
    );
    expect(sb1 - sb0).toBe(1);
    // Opponent's turn then EOT — Suframare condition is whose_turn: owner
    whenEndTurn();
    runEndOfTurnBoundary("second");
    const sb2 = sbCount(
      thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!,
    );
    expect(sb2 - sb1).toBe(0);
  });
});

describe("draw/destroy templated count — normalisers preserve templates", () => {
  it("draw.count keeps {last_returned} (Noble Philosopher 10932120)", () => {
    const spec = normalizeDrawSpec({
      op: "draw",
      count: "{last_returned}",
    } as any);
    expect(spec.count).toBe("{last_returned}");
    // Runtime: tests/audit/batch10009_sword_forest_rune.test.ts
    // "Noble Philosopher — returns hand to deck and draws equal count"
  });

  it("destroy.count keeps {enemy_minus_ally_followers} (Marlone 10811110)", () => {
    const spec = normalizeDestroySpec({
      op: "destroy",
      target: "enemy:follower",
      count: "{enemy_minus_ally_followers}",
    } as any);
    expect(spec.count_raw).toBe("{enemy_minus_ally_followers}");
  });
});
