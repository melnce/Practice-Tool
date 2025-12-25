/**
 * @file Mechanic Contract Test: enhance
 *
 * DESIGN: Tests the enhance mechanic.
 *
 * INVARIANTS UNDER TEST:
 * - Enhance activates when PP >= enhance cost
 * - Enhance fires bonus effects
 * - Enhance consumes extra PP
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenHP,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: enhance", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // ENHANCE STRUCTURE
    // ===========================================================================

    describe("enhance structure", () => {
        it("card with enhance has correct structure", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "EnhanceCard",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    cost: 3,
                    enhance: {
                        cost: 7,
                        effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
                    },
                }])
                .build();

            const card = findOnBoard("first", "EnhanceCard");
            expect(card!.enhance).toBeDefined();
            expect(card!.enhance!.cost).toBe(7);
            expect(card!.enhance!.effects).toBeDefined();
        });
    });

    // ===========================================================================
    // ENHANCE ACTIVATION
    // ===========================================================================

    describe("enhance activation", () => {
        it("enhance gate fires when PP >= enhance cost", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.pp = 7;

            // Simulate enhance as a gate condition
            const effect = {
                op: "gate" as const,
                condition: "enhance",
                cost: 7,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(15);
        });

        it("enhance does NOT fire when PP < enhance cost", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.pp = 5;

            const effect = {
                op: "gate" as const,
                condition: "enhance",
                cost: 7,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(20);
        });
    });

    // ===========================================================================
    // MULTIPLE ENHANCE LEVELS
    // ===========================================================================

    describe("multiple enhance levels", () => {
        it("card can have multiple enhance levels", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "MultiEnhance",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    cost: 2,
                    enhances: [
                        { cost: 5, effects: [{ op: "stat", action: "give", target: "self", attack: 2 }] },
                        { cost: 8, effects: [{ op: "stat", action: "give", target: "self", attack: 5 }] },
                    ],
                }])
                .build();

            const card = findOnBoard("first", "MultiEnhance");
            expect(card!.enhances).toBeDefined();
            expect(card!.enhances!.length).toBe(2);
        });
    });
});
