import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { loadCardDatabase } from "../../src/data/cardDatabase";
import { handleRecoverEP } from "../../src/logic/effects/leader";

describe("Ewiyar - recover_ep operation", () => {
    beforeAll(async () => {
        await loadCardDatabase();
    });

    beforeEach(() => {
        resetGameState();
    });

    it("should recover EP when below max", () => {
        // Setup: EP at 0 (both used)
        state.blueEvoCharges = 0;

        // Call recover_ep with amount 1
        handleRecoverEP("blue", { op: "recover_ep", amount: 1 } as any);

        // EP should be 1 (recovered from 0)
        expect(state.blueEvoCharges).toBe(1);
    });

    it("should cap EP at 2 (starting max)", () => {
        // Setup: EP already at 2 (unused)
        state.blueEvoCharges = 2;

        // Call recover_ep with amount 1
        handleRecoverEP("blue", { op: "recover_ep", amount: 1 } as any);

        // EP should still be 2 (capped, not 3)
        expect(state.blueEvoCharges).toBe(2);
    });

    it("should not exceed max even with large amount", () => {
        // Setup: EP at 1
        state.blueEvoCharges = 1;

        // Call recover_ep with amount 5
        handleRecoverEP("blue", { op: "recover_ep", amount: 5 } as any);

        // EP should be capped at 2, not 6
        expect(state.blueEvoCharges).toBe(2);
    });

    it("should work for red player too", () => {
        // Setup: Red EP at 0
        state.redEvoCharges = 0;

        // Call recover_ep for red
        handleRecoverEP("red", { op: "recover_ep", amount: 1 } as any);

        // Red EP should be 1
        expect(state.redEvoCharges).toBe(1);
    });
});


