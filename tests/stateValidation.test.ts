
import { describe, it, expect } from "vitest";
import { validateGameState, assertValidGameState } from "#core/stateValidation";
import { state, resetGameState } from "#core/gameState";
import { GameState } from "#core/types";

describe("GameState Validation", () => {

    it("validates the initial clean state", () => {
        resetGameState();
        const result = validateGameState(state);
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
        expect(() => assertValidGameState(state)).not.toThrow();
    });

    it("detects null entries in card arrays", () => {
        resetGameState();
        // @ts-ignore
        state.blueHand.push(null);

        const result = validateGameState(state);
        expect(result.valid).toBe(false);
        expect(result.issues[0]).toContain("Null/undefined entry in blueHand");

        expect(() => assertValidGameState(state)).toThrow("Invalid GameState");
    });

    it("detects duplicate instanceIds in active zones", () => {
        resetGameState();
        const card1 = { uid: "c1", name: "C1", instanceId: 100 } as any;
        const card2 = { uid: "c2", name: "C2", instanceId: 100 } as any;

        state.blueHand.push(card1);
        state.redBoard.push(card2);

        const result = validateGameState(state);
        expect(result.valid).toBe(false);
        expect(result.issues[0]).toContain("Duplicate instanceId 100");
    });

    it("detects invalid numeric fields", () => {
        resetGameState();
        state.bluePP = -1;
        state.redShadows = NaN;

        const result = validateGameState(state);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes("bluePP"))).toBe(true);
        expect(result.issues.some(i => i.includes("redShadows"))).toBe(true);
    });

    it("allows negative HP (valid for dead players)", () => {
        resetGameState();
        state.blueHP = -5;
        const result = validateGameState(state);
        // Should be valid as long as it's a number
        expect(result.valid).toBe(true);
    });

    it("reports missing critical arrays", () => {
        // Create a broken object manually
        const brokenState = JSON.parse(JSON.stringify(state));
        delete brokenState.blueDeck;

        const result = validateGameState(brokenState);
        expect(result.valid).toBe(false);
        expect(result.issues[0]).toContain("Missing or invalid array: blueDeck");
    });
});
