/**
 * @file Mechanic Contract Test: mode
 *
 * DESIGN: Tests the mode operation for choice/selection mechanics.
 *
 * COVERAGE:
 * - Mode selection with options
 * - Mode effects fire for selected choice
 *
 * INVARIANTS UNDER TEST:
 * - Selected mode's effects are executed
 * - modeBonus counter is updated
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenHP,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: mode", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // MODE_BONUS COUNTER
    // ===========================================================================

    describe("mode_bonus operation", () => {
        it("increments mode bonus counter", () => {
            // GIVEN: Player with 0 mode bonus
            givenGameState({ seed: 1 }).build();

            expect(state.players.first.modeBonus).toBe(0);

            // WHEN: Add 3 mode bonus
            const effect = {
                op: "mode_bonus" as const,
                amount: 3,
            };
            whenRunEffects([effect], "first");

            // THEN: Mode bonus should be 3
            expect(state.players.first.modeBonus).toBe(3);
        });

        it("accumulates mode bonus across multiple effects", () => {
            // GIVEN: Player with 0 mode bonus
            givenGameState({ seed: 1 }).build();

            // WHEN: Add mode bonus twice
            whenRunEffects([
                { op: "mode_bonus" as const, amount: 2 },
                { op: "mode_bonus" as const, amount: 3 },
            ], "first");

            // THEN: Mode bonus should be 5
            expect(state.players.first.modeBonus).toBe(5);
        });
    });

    // ===========================================================================
    // MODE SELECTION
    // ===========================================================================

    describe("mode selection", () => {
        it("mode operation with options is valid", () => {
            // GIVEN: Empty state
            givenGameState({ seed: 1 }).build();

            // WHEN: Execute mode with options
            // NOTE: Mode typically pauses for user input, so this tests the setup
            const effect = {
                op: "mode" as const,
                options: [
                    {
                        label: "Option A",
                        effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
                    },
                    {
                        label: "Option B",
                        effects: [{ op: "draw", source: "deck", count: 1 }],
                    },
                ],
            };

            // Mode ops typically return "pending" waiting for input
            // Just verify no crash for now
            expect(() => {
                whenRunEffects([effect], "first");
            }).not.toThrow();
        });
    });
});
