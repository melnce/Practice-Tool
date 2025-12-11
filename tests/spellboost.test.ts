
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "#core/gameState";
import { runEffects } from "#logic/core/effects/index";
import { makeUid } from "#core/rng";
import { spellboostCard } from "./utils/testCards";

/**
 * Helper to get a fresh copy of the spellboost card.
 */
function getSBCard(owner: "blue" | "red" = "blue") {
    return { ...spellboostCard, uid: makeUid(), owner, spellboostCount: 0, cost: 10, base_cost: 10 };
}

describe("Spellboost Mechanics", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("should reduce cost when spellboosted", () => {
        const card = getSBCard("blue");
        state.blueHand = [card];

        // Trigger spellboost
        const sbEff = { op: "spellboost", count: 1 };
        runEffects([sbEff], "blue", null);

        expect(card.spellboostCount).toBe(1);
        expect(card.cost).toBe(9);
    });

    it("should stack multiple boosts", () => {
        const card = getSBCard("blue");
        state.blueHand = [card];

        runEffects([{ op: "spellboost", count: 1 }], "blue", null);
        runEffects([{ op: "spellboost", count: 1 }], "blue", null);

        expect(card.spellboostCount).toBe(2);
        expect(card.cost).toBe(8);
    });

    it("should not reduce cost below minCost (0)", () => {
        const card = getSBCard("blue");
        card.cost = 1; // Almost 0
        state.blueHand = [card];

        runEffects([{ op: "spellboost", count: 1 }], "blue", null);
        expect(card.cost).toBe(0);

        runEffects([{ op: "spellboost", count: 1 }], "blue", null);
        expect(card.cost).toBe(0); // Cap at 0
        expect(card.spellboostCount).toBe(2); // Count still goes up
    });
});
