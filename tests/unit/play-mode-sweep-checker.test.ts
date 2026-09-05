/**
 * Gates for the play-mode sweep invariant functions.
 *
 * Synthetic outcomes only — proves I1/I2 fail when the recorded values
 * are wrong, and that I1' reconciliation passes iff a recoverPP event
 * explains the PP delta.
 */
import { describe, it, expect } from "vitest";
import {
  checkI1,
  checkI2,
  checkI6,
  summarizePlayEvents,
  syntheticSweepCase,
} from "../../scripts/lib/playModeSweep.js";

describe("play-mode sweep checker gates", () => {
  it("I1 fails when ppAfter is off by one from ppBefore − plan.cost", () => {
    const rec = syntheticSweepCase({
      accepted: true,
      rejected: false,
      pp: 8,
      ppBefore: 8,
      ppAfter: 1,
      plan: {
        mode: "enhance",
        cost: 8,
        enhanceTiers: [7, 8],
        alternate: null,
        effectivePlayCost: 6,
      },
      cardEnhanceTiers: [7, 8],
      cardNormalCost: 6,
    });
    const row = checkI1(rec);
    expect(row.applicable).toBe(true);
    expect(row.passed).toBe(false);
    expect(row.expected).toBe(0);
    expect(row.observed).toBe(1);
  });

  it("I1 passes when the same ppAfter is explained by a recoverPP event", () => {
    const rec = syntheticSweepCase({
      accepted: true,
      rejected: false,
      pp: 8,
      ppBefore: 8,
      ppAfter: 7,
      plan: {
        mode: "enhance",
        cost: 8,
        enhanceTiers: [8],
        alternate: null,
        effectivePlayCost: 2,
      },
      cardEnhanceTiers: [8],
      cardNormalCost: 2,
      playEvents: [
        { type: "recoverPP", details: { owner: "first", amount: 7 } },
      ],
    });
    const row = checkI1(rec);
    expect(rec.recoveredPP).toBe(7);
    expect(row.applicable).toBe(true);
    expect(row.passed).toBe(true);
    expect(row.expected).toBe(7);
    expect(row.observed).toBe(7);
  });

  it("I1 fails when that recoverPP event is removed", () => {
    const rec = syntheticSweepCase({
      accepted: true,
      rejected: false,
      pp: 8,
      ppBefore: 8,
      ppAfter: 7,
      plan: {
        mode: "enhance",
        cost: 8,
        enhanceTiers: [8],
        alternate: null,
        effectivePlayCost: 2,
      },
      cardEnhanceTiers: [8],
      cardNormalCost: 2,
      playEvents: [],
    });
    const row = checkI1(rec);
    expect(rec.recoveredPP).toBe(0);
    expect(row.applicable).toBe(true);
    expect(row.passed).toBe(false);
    expect(row.expected).toBe(0);
    expect(row.observed).toBe(7);
  });

  it("I2 fails when the plan claims enhance at pp below every tier", () => {
    const rec = syntheticSweepCase({
      pp: 3,
      accepted: false,
      rejected: true,
      cardEnhanceTiers: [7],
      cardNormalCost: 5,
      cardAlternates: [],
      plan: {
        mode: "enhance",
        cost: 7,
        enhanceTiers: [7],
        alternate: null,
        effectivePlayCost: 5,
      },
    });
    const row = checkI2(rec);
    expect(row.applicable).toBe(true);
    expect(row.passed).toBe(false);
    expect(row.expected).toEqual({ mode: "rejected" });
    expect(row.observed).toEqual({
      rejected: true,
      mode: "enhance",
      cost: 7,
      enhanceTiers: [7],
    });
  });

  it("I6 passes when handAfter is explained by a per-card draw event", () => {
    const rec = syntheticSweepCase({
      accepted: true,
      printedType: "Spell",
      handBefore: 1,
      handAfter: 2,
      cardInGraveyard: true,
      playEvents: [
        { type: "draw", details: { owner: "first", card: "Fairy", uid: "d1" } },
        { type: "draw", details: { owner: "first", card: "Fairy", uid: "d2" } },
      ],
    });
    const row = checkI6(rec);
    expect(rec.drawn).toBe(2);
    expect(row.passed).toBe(true);
    expect(row.expected).toEqual({
      handAfter: 2,
      inGraveyardOrBanish: true,
    });
  });
});

describe("summarizePlayEvents", () => {
  it("does not double-count unified draw {count} plus per-card drawCard events", () => {
    const sum = summarizePlayEvents([
      { type: "draw", details: { owner: "first", count: 3 } },
      { type: "draw", details: { owner: "first", card: "A", uid: "1" } },
      { type: "draw", details: { owner: "first", card: "B", uid: "2" } },
      { type: "draw", details: { owner: "first", card: "C", uid: "3" } },
    ]);
    expect(sum.drawn).toBe(3);
  });
});
