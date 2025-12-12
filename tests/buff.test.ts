
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../src/core/gameState";
import { runEffects } from "../src/logic/core/effects";
import { makeUid } from "../src/core/rng";
import { vanillaFollower } from "./utils/testCards";

describe("Buff Mechanics", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("should buff follower attack and defense", () => {
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "blue", attack: 1, defense: 1 };
        state.blueBoard = [unit];

        const buffEff = {
            op: "buff",
            target: "ally:follower",
            attack: 2,
            defense: 2
        };

        runEffects([buffEff], "blue", null);

        expect(unit.attack).toBe(3);
        expect(unit.defense).toBe(3);
        expect(unit.buffs?.attack).toBe(2);
        expect(unit.buffs?.defense).toBe(2);
    });

    it("should apply negative buffs (debuffs)", () => {
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "blue", attack: 3, defense: 3 };
        state.blueBoard = [unit];

        const debuff = {
            op: "buff",
            target: "ally:follower",
            attack: -1,
            defense: -1
        };

        runEffects([debuff], "blue", null);

        expect(unit.attack).toBe(2);
        expect(unit.defense).toBe(2);
    });

    it("should handle multi-stat adjustments via misc ops if any", () => {
        // Checking "set_attack_to" if existing, or similar
        // Let's rely on standard buff op which is robust.
        // We can test specific targeting like "buff only 1 unit"

        const u1 = { ...vanillaFollower, uid: makeUid(), owner: "blue", attack: 1 };
        const u2 = { ...vanillaFollower, uid: makeUid(), owner: "blue", attack: 1 };
        state.blueBoard = [u1, u2];

        // Mock selection by setting state.pendingTarget... but runEffects usually handles auto if no select needed?
        // If we use 'random'
        const buffRandom = {
            op: "buff",
            target: "ally:follower",
            random: true,
            count: 1,
            attack: 5
        };

        runEffects([buffRandom], "blue", null);

        const totalAtk = (u1.attack as number) + (u2.attack as number);
        // 1+6 = 7, or 6+1 = 7. Initial 1+1=2. Delta is 5.
        expect(totalAtk).toBe(7);
    });
});
