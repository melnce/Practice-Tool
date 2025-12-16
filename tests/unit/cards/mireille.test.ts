// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window for cardDatabase if needed
if (typeof window === "undefined") {
    (global as any).window = {};
}

import { state } from "../../../src/core/gameState.js";
import { handleEvolveLastSummoned } from "../../../src/logic/effects/ops/evolve.js";
import { CardInstance } from "../../../src/core/types.js";

// We mock ONLY what we need. 
// We are testing: handleEvolveLastSummoned logic + JSON correctness (via separate check).

describe("Mireille & Risette Fix", () => {
    beforeEach(() => {
        (globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 1);
        (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
        state.lastSummoned = [];
        state.blueBoard = [];
    });

    it("handleEvolveLastSummoned should evolve only cards in state.lastSummoned", () => {
        const owner = "blue";

        // Mock Cards
        const token = {
            name: "Mireille Token",
            type: "Follower",
            zone: "board",
            hasEvolved: false,
            uid: "token1"
        } as CardInstance;

        const otherUnit = {
            name: "Other Unit",
            type: "Follower",
            zone: "board",
            hasEvolved: false,
            uid: "unit1"
        } as CardInstance;

        // Setup State
        state.lastSummoned = [token];
        // We don't need full board state for the function unless it checks board, 
        // but the function iterates lastSummoned. 
        // Note: The function checks `card.zone === "board"`.

        // Execute
        handleEvolveLastSummoned(owner);

        // Assert
        expect(token.hasEvolved).toBe(true); // Evolved
        expect(token.buffs?.attack).toBe(2); // Normal evo

        // Ensure other unit untouched (it wasn't in lastSummoned)
        expect(otherUnit.buffs).toBeUndefined();
    });

    it("JSON Data Verification: Mireille uses correct ops", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.resolve(__dirname, "../../../cards/sets/10004_skybound-dragons.json");
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const cards = JSON.parse(fileContent);

        const card = cards.find((c: any) => c.id === "10432120");
        expect(card).toBeDefined();

        // Check Earth Rite effect
        const erEffect = card.fanfare.find((e: any) => e.op === "earth_rite");
        expect(erEffect).toBeDefined();

        const subEffects = erEffect.effects;
        expect(subEffects).toBeDefined();
        expect(subEffects.length).toBe(2);

        expect(subEffects[0].op).toBe("evolve_last_summoned");
        expect(subEffects[1].op).toBe("evolve_self"); // Order matters? Usually "it and this follower" implies "it" first.
    });
});
