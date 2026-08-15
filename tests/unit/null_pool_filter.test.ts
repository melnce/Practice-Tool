/**
 * Regression: getPool may include null board placeholders during deferred death.
 * Damage/stat filters must skip nulls (soak crashes on seed 20260815 games 37/229).
 */
import { describe, it, expect } from "vitest";
import { filterBuffCandidates } from "../../src/logic/effects/ops/stat/utils.js";

describe("null-safe pool filters", () => {
  it("filterBuffCandidates ignores null slots", () => {
    const follower = {
      type: "Follower",
      name: "A",
      attack: 1,
      defense: 1,
    } as any;
    const out = filterBuffCandidates(
      [null as any, follower, null as any],
      { op: "stat" } as any,
      null,
    );
    expect(out).toEqual([follower]);
  });
});
