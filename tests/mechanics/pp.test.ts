/**
 * @file Mechanic Contract Test: PP (play points) manipulation
 *
 * DESIGN: Tests PP operations (gain, recover, max).
 *
 * INVARIANTS UNDER TEST:
 * - Gain PP increases recoverable PP
 * - Recover PP restores current PP
 * - Max PP caps at 10
 * - PP changes target correct player
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenPP,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: PP", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // RECOVER PP
    // ===========================================================================

    describe("recover_pp", () => {
        it("recovers PP by specified amount", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(3)
                .build();

            const effect = {
                op: "recover_pp" as const,
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBe(5);
        });

        it("PP cannot exceed max PP", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(8)
                .build();

            state.players.first.maxPp = 10;

            const effect = {
                op: "recover_pp" as const,
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBeLessThanOrEqual(10);
        });

        it("recovers for correct player", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(3)
                .withSecondPP(2)
                .build();

            const effect = {
                op: "recover_pp" as const,
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBe(5);
            expect(thenPP("second")).toBe(2);
        });
    });

    // ===========================================================================
    // GAIN MAX PP
    // ===========================================================================

    describe("gain_max_pp", () => {
        it("increases max PP", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.maxPp = 5;

            const effect = {
                op: "gain_max_pp" as const,
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.maxPp).toBe(6);
        });

        it("max PP caps at 10", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.maxPp = 9;

            const effect = {
                op: "gain_max_pp" as const,
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.maxPp).toBeLessThanOrEqual(10);
        });

        it("gain_max_pp also recovers PP", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(3)
                .build();

            state.players.first.maxPp = 5;

            const effect = {
                op: "gain_max_pp" as const,
                amount: 1,
            };
            whenRunEffects([effect], "first");

            // PP should also increase
            expect(thenPP("first")).toBe(4);
        });
    });

    // ===========================================================================
    // EDGE CASES
    // ===========================================================================

    describe("edge cases", () => {
        it("recover 0 PP does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(5)
                .build();

            const effect = {
                op: "recover_pp" as const,
                amount: 0,
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBe(5);
        });
    });
});
