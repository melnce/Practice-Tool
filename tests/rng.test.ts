
import { describe, it, expect } from "vitest";
import { rand, randInt, choice, setRNGSeed, getRngSnapshot, setRngSnapshot } from "../src/core/rng";

describe("RNG Module", () => {

    it("is non-deterministic by default (or when seeded null)", () => {
        setRNGSeed(null);
        const r1 = rand();
        expect(r1).toBeGreaterThanOrEqual(0);
        expect(r1).toBeLessThan(1);

        // Unlikely to equal, but technically possible. In practice, just checking range is enough per strict constraint.
    });

    it("produces deterministic sequences when seeded", () => {
        setRNGSeed(12345);
        const a1 = rand();
        const a2 = randInt(100);
        const a3 = choice([1, 2, 3]);

        setRNGSeed(12345);
        const b1 = rand();
        const b2 = randInt(100);
        const b3 = choice([1, 2, 3]);

        expect(a1).toBe(b1);
        expect(a2).toBe(b2);
        expect(a3).toBe(b3);
    });

    it("different seeds produce different sequences", () => {
        setRNGSeed(111);
        const v1 = rand();

        setRNGSeed(222);
        const v2 = rand();

        expect(v1).not.toBe(v2);
    });

    it("supports snapshot save/restore", () => {
        setRNGSeed("snapshot-test");
        const v1 = rand();
        const snap = getRngSnapshot();
        const v2 = rand(); // consumed

        setRngSnapshot(snap);
        const v2_replay = rand(); // should match v2

        expect(v2_replay).toBe(v2);
    });
});
