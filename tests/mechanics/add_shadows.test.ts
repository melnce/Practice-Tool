/**
 * @file Mechanic Contract Test: add_shadows
 *
 * DESIGN: Tests the add_shadows operation specifically.
 *
 * INVARIANTS UNDER TEST:
 * - add_shadows increases shadow count
 * - Correct player gets shadows
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: add_shadows", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // ADD SHADOWS
    // ===========================================================================

    describe("add shadows", () => {
        it("increases shadow count by specified amount", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 5;

            const effect = {
                op: "add_shadows" as const,
                amount: 3,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.shadows).toBe(8);
        });

        it("shadows are per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 10;
            state.players.second.shadows = 3;

            const effect = {
                op: "add_shadows" as const,
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.shadows).toBe(15);
            expect(state.players.second.shadows).toBe(3);
        });
    });
});
