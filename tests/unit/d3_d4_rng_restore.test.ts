/**
 * D3/D4: RNG restore checkpoint correctness across seed changes and past float64.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../../src/core/rng.js";

describe("D3: rng.restore invalidates checkpoints on seed change", () => {
  it("restore to a different seed matches a fresh RNG at that cursor", () => {
    const rng = createRng(1);
    for (let i = 0; i < 2500; i++) rng.nextFloat();

    rng.restore({ seed: 999, cursor: 1500 });
    const restored = [rng.nextFloat(), rng.nextFloat()];

    const fresh = createRng(999);
    for (let i = 0; i < 1500; i++) fresh.nextFloat();
    const expected = [fresh.nextFloat(), fresh.nextFloat()];

    expect(restored).toEqual(expected);
  });
});

describe("D4: checkpoint arithmetic stays exact past ~4.9M draws", () => {
  it("restore via high-cursor checkpoint matches fast-forward from zero", () => {
    const CURSOR = 5_000_000;
    const SEED = 1;

    const drawn = createRng(SEED);
    for (let i = 0; i < CURSOR; i++) drawn.nextFloat();
    // Checkpoint at 5M now exists; restore through it
    drawn.restore({ seed: SEED, cursor: CURSOR });
    const viaCheckpoint = drawn.nextFloat();

    const viaFF = createRng(SEED);
    viaFF.restore({ seed: SEED, cursor: CURSOR });
    const expected = viaFF.nextFloat();

    expect(viaCheckpoint).toBe(expected);

    // Pre-fix bug: float64 `seed + cursor * K` (no >>>0 / Math.imul) diverged
    // from the live stream past ~4,917,758. Prove the broken formula still differs
    // from the corrected uint32 stream at this cursor.
    const brokenState = SEED + CURSOR * 0x6d2b79f5; // float64 — loses precision
    let t = brokenState + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const brokenNext = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    expect(brokenNext).not.toBe(viaCheckpoint);
  });
});
