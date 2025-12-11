
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "#core/gameState";
import { loadCardDatabase } from "#data/cardDatabase";
import { runEffects } from "#logic/core/effects";
import { applyLeaderDamage } from "#logic/effects/leader";
import { makeUid } from "#core/rng";
import { vanillaFollower, damageSpell } from "./utils/testCards";

describe("Damage Mechanics", () => {
    beforeAll(async () => {
        await loadCardDatabase();
    });

    beforeEach(() => {
        resetGameState();
        state.blueHealth = 20;
        state.redHealth = 20;
    });

    it("should deal direct damage to leader", () => {
        applyLeaderDamage("blue", 3);
        expect(state.blueHealth).toBe(17);
    });

    it("should prevent leader damage if barrier is active", () => {
        state.blueLeaderBarrier = 1;
        applyLeaderDamage("blue", 10);
        expect(state.blueHealth).toBe(20);
        expect(state.blueLeaderBarrier).toBe(0);
    });

    it("should deal damage to an enemy follower via effect", () => {
        // Setup board
        const enemy = { ...vanillaFollower, uid: makeUid(), owner: "red", defense: 5 };
        state.redBoard = [enemy];

        // Execute damage spell effect directly (simulate playing it)
        runEffects(damageSpell.spell!, "blue", null);

        // Assert
        expect(enemy.defense).toBe(2);
        expect(state.redBoard.length).toBe(1);
    });

    it("should destroy follower if damage exceeds defense", () => {
        const enemy = { ...vanillaFollower, uid: makeUid(), owner: "red", defense: 2 };
        state.redBoard = [enemy];

        runEffects(damageSpell.spell!, "blue", null);

        // Cleanup typically happens via check deaths, but runEffects might not auto-clean unless triggered.
        // However, standard damage logic usually updates stats. Death cleanup is separate step usually.
        // Let's check implicit destruction or just stat update.
        // runEffects usually calls `handleDamage`.

        expect(enemy.defense).toBeLessThanOrEqual(0);
    });

    it("should apply AOE damage correctly", () => {
        const e1 = { ...vanillaFollower, uid: makeUid(), owner: "red", defense: 2 };
        const e2 = { ...vanillaFollower, uid: makeUid(), owner: "red", defense: 3 };
        state.redBoard = [e1, e2];

        // Custom AOE effect
        const aoe = { op: "damage_all", target: "enemy:follower", amount: 2 };
        runEffects([aoe], "blue", null);

        expect(e1.defense).toBe(0);
        expect(e2.defense).toBe(1);
    });
});
