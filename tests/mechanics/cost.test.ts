/**
 * @file Mechanic Contract Test: cost manipulation
 *
 * DESIGN: Tests cost modification operations.
 *
 * INVARIANTS UNDER TEST:
 * - Cost reduction modifies card cost correctly
 * - Cost cannot go below 0
 * - Cost changes target correct cards
 * - Spellboost cost reduction
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenHand,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: cost", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // COST REDUCTION
    // ===========================================================================

    describe("cost reduction", () => {
        it("reduces card cost by specified amount", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Expensive", type: "Follower", cost: 5, attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "cost" as const,
                action: "reduce",
                target: "ally:hand",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            const card = thenHand("first").find(c => c.name === "Expensive");
            expect(card!.cost).toBe(3);
        });

        it("cost cannot go below 0", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Cheap", type: "Follower", cost: 2, attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "cost" as const,
                action: "reduce",
                target: "ally:hand",
                amount: 5,
            };
            whenRunEffects([effect], "first");

            const card = thenHand("first").find(c => c.name === "Cheap");
            expect(card!.cost).toBeGreaterThanOrEqual(0);
        });

        it("reduces all matching cards in hand", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([
                    { name: "A", type: "Follower", cost: 5, attack: 1, defense: 1 },
                    { name: "B", type: "Follower", cost: 4, attack: 1, defense: 1 },
                    { name: "C", type: "Follower", cost: 3, attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "cost" as const,
                action: "reduce",
                target: "ally:hand",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            const hand = thenHand("first");
            expect(hand.find(c => c.name === "A")!.cost).toBe(4);
            expect(hand.find(c => c.name === "B")!.cost).toBe(3);
            expect(hand.find(c => c.name === "C")!.cost).toBe(2);
        });

        it("does NOT affect enemy hand", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Ally", type: "Follower", cost: 5, attack: 1, defense: 1 }])
                .withSecondHand([{ name: "Enemy", type: "Follower", cost: 5, attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "cost" as const,
                action: "reduce",
                target: "ally:hand",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first")[0].cost).toBe(3);
            expect(thenHand("second")[0].cost).toBe(5);
        });
    });

    // ===========================================================================
    // COST SET
    // ===========================================================================

    describe("cost set", () => {
        it("sets cost to exact value", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Target", type: "Follower", cost: 8, attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "cost" as const,
                action: "set",
                target: "ally:hand",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first")[0].cost).toBe(1);
        });

        it("can set cost to 0", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Target", type: "Follower", cost: 5, attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "cost" as const,
                action: "set",
                target: "ally:hand",
                amount: 0,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first")[0].cost).toBe(0);
        });
    });

    // ===========================================================================
    // SPELLBOOST
    // ===========================================================================

    describe("spellboost", () => {
        it("increments spellboost counter on card", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "SpellboostCard",
                    type: "Spell",
                    cost: 10,
                    hasSpellboost: true,
                    spellboostCount: 0,
                }])
                .build();

            const effect = {
                op: "spellboost" as const,
                target: "ally:hand",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            const card = thenHand("first")[0];
            expect(card.spellboostCount).toBe(1);
        });

        it("spellboost reduces cost (if card has cost reduction per boost)", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "SpellboostCard",
                    type: "Spell",
                    cost: 10,
                    originalCost: 10,
                    hasSpellboost: true,
                    spellboostCostReduction: 1,
                    spellboostCount: 0,
                }])
                .build();

            const effect = {
                op: "spellboost" as const,
                target: "ally:hand",
                amount: 3,
            };
            whenRunEffects([effect], "first");

            const card = thenHand("first")[0];
            // Cost should reduce by 3 (1 per boost)
            expect(card.cost).toBe(7);
        });
    });
});
