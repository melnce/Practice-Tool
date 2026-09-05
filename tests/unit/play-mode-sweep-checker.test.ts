/**
 * Gates for the play-mode sweep invariant functions.
 *
 * Synthetic outcomes only — proves I1 and I2 actually fail when the
 * recorded values are wrong, so a broken checker cannot rubber-stamp
 * the live sweep.
 */
import { describe, it, expect } from "vitest";
import {
  checkI1,
  checkI2,
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
});
