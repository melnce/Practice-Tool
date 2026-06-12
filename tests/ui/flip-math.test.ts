import { describe, it, expect } from "vitest";
import { computeInvertTransform } from "../../src/ui/motion/flip.js";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("flip math", () => {
  it("returns identity for identical rects", () => {
    const r = rect(10, 20, 100, 140);
    const t = computeInvertTransform(r, r);
    expect(t).toEqual({ dx: 0, dy: 0, sx: 1, sy: 1 });
  });

  it("computes translation when position changes", () => {
    const from = rect(0, 0, 100, 140);
    const to = rect(50, 30, 100, 140);
    const t = computeInvertTransform(from, to);
    expect(t.dx).toBe(-50);
    expect(t.dy).toBe(-30);
    expect(t.sx).toBe(1);
    expect(t.sy).toBe(1);
  });

  it("computes scale when size changes", () => {
    const from = rect(0, 0, 200, 280);
    const to = rect(0, 0, 100, 140);
    const t = computeInvertTransform(from, to);
    expect(t.dx).toBe(0);
    expect(t.dy).toBe(0);
    expect(t.sx).toBe(2);
    expect(t.sy).toBe(2);
  });

  it("handles zero-size rects safely", () => {
    const t = computeInvertTransform(rect(0, 0, 0, 0), rect(10, 10, 100, 100));
    expect(t).toEqual({ dx: 0, dy: 0, sx: 1, sy: 1 });
  });
});
