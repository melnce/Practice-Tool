/**
 * Regression: `{ op: "draw", count: N }` without source means draw from deck.
 * Soak seed 20260815 game 197 crashed on missing source.
 */
import { describe, it, expect } from "vitest";
import { normalizeToUnifiedSpec } from "../../src/logic/effects/ops/draw/types.js";

describe("draw source default", () => {
  it("defaults missing source to deck", () => {
    const spec = normalizeToUnifiedSpec({ op: "draw", count: 2 } as any);
    expect(spec.source).toBe("deck");
    expect(spec.count).toBe(2);
  });

  it("still rejects non-deck sources", () => {
    expect(() =>
      normalizeToUnifiedSpec({ op: "draw", source: "named", count: 1 } as any),
    ).toThrow(/Invalid source/);
  });
});
