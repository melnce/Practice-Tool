import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { getPool } from "../../src/logic/core/targeting";
import { makeUid } from "../../src/core/rng";
import { vanillaFollower } from "../fixtures/utils/testCards";

describe("Targeting Resolution", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("should resolve 'ally:follower'", () => {
        const u1 = { ...vanillaFollower, uid: makeUid(), owner: "blue" as const };
        state.blueBoard = [u1];

        const targets = getPool("ally:follower", "blue");
        expect(targets.length).toBe(1);
        expect(targets[0].uid).toBe(u1.uid);
    });

    it("should resolve 'enemy:follower'", () => {
        const u1 = { ...vanillaFollower, uid: makeUid(), owner: "red" as const };
        state.redBoard = [u1];

        const targets = getPool("enemy:follower", "blue"); // Blue looking for red
        expect(targets.length).toBe(1);
        expect(targets[0].uid).toBe(u1.uid);
    });

    it("should resolve 'enemy:leader'", () => {
        // Not implemented in test yet
    });

    it("should resolve 'enemy:follower:random' gracefully as pool", () => {
        const u1 = { ...vanillaFollower, uid: makeUid(), owner: "red" as const };
        const u2 = { ...vanillaFollower, uid: makeUid(), owner: "red" as const };
        state.redBoard = [u1, u2];

        // Ensure "random" suffix doesn't break parsing (it should be ignored by getPool, returning full pool)
        const targets = getPool("enemy:follower:random", "blue");
        expect(targets.length).toBe(2);
    });

    it("should return empty for invalid targets", () => {
        const targets = getPool("invalid:selector", "blue");
        expect(targets.length).toBe(0);
    });
});


