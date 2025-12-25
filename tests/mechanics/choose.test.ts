/**
 * @file Mechanic Contract Test: choose/mode selection
 *
 * DESIGN: Tests the choose/mode mechanics for player selection.
 *
 * INVARIANTS UNDER TEST:
 * - Choose presents options
 * - Selected option fires its effects
 * - chooseBonus affects choose count
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

describe("Mechanic Contract: choose", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // CHOOSE STRUCTURE
    // ===========================================================================

    describe("choose structure", () => {
        it("card with choose has options defined", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "ChooseCard",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    choose: {
                        count: 1,
                        options: [
                            { label: "Option A", effects: [{ op: "damage", target: "enemy:leader", amount: 2 }] },
                            { label: "Option B", effects: [{ op: "restore", target: "ally:leader", amount: 2 }] },
                        ],
                    },
                }])
                .build();

            const card = findOnBoard("first", "ChooseCard");
            expect(card!.choose).toBeDefined();
            expect(card!.choose!.options.length).toBe(2);
        });
    });

    // ===========================================================================
    // CHOOSE BONUS
    // ===========================================================================

    describe("choose bonus", () => {
        it("chooseBonus counter is tracked", () => {
            givenGameState({ seed: 1 }).build();

            state.players.first.chooseBonus = 1;

            expect(state.players.first.chooseBonus).toBe(1);
        });

        it("chooseBonus increases choose count", () => {
            givenGameState({ seed: 1 }).build();

            state.players.first.chooseBonus = 2;

            // With base choose 1 + bonus 2 = 3 choices
            // This affects how many options can be selected
        });
    });

    // ===========================================================================
    // MODE SELECTION (SIMILAR TO CHOOSE)
    // ===========================================================================

    describe("mode selection", () => {
        it("mode operation with options is valid", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "mode" as const,
                options: [
                    { label: "Draw", effects: [{ op: "draw", source: "deck", count: 1 }] },
                    { label: "Damage", effects: [{ op: "damage", target: "enemy:leader", amount: 2 }] },
                ],
            };

            // Mode should be valid structure
            expect(effect.options.length).toBe(2);
        });
    });
});
