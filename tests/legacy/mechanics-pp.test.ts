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
import "../fixtures/setup.ts";
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
    // Canonical: { op: "pp", action: "recover", amount: N, player: "self"|"enemy" }
    // ===========================================================================

    describe("pp action: recover", () => {
        it("recovers PP by specified amount", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(3, 10) // PP 3, maxPP 10
                .build();

            const effect = {
                op: "pp" as const,
                action: "recover",
                amount: 2,
                player: "self",
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBe(5);
        });

        it("PP cannot exceed max PP", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(8, 10) // PP 8, maxPP 10
                .build();

            const effect = {
                op: "pp" as const,
                action: "recover",
                amount: 5,
                player: "self",
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBeLessThanOrEqual(10);
        });

        it("recovers for correct player", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(3, 10)
                .withSecondPP(2, 10)
                .build();

            const effect = {
                op: "pp" as const,
                action: "recover",
                amount: 2,
                player: "self",
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBe(5);
            expect(thenPP("second")).toBe(2);
        });
    });

    // ===========================================================================
    // GAIN MAX PP
    // Canonical: { op: "pp", action: "gain_max", amount: N, player: "self"|"enemy" }
    // ===========================================================================

    describe("pp action: gain_max", () => {
        it("increases max PP", () => {
            givenGameState({ seed: 1, roundCount: 1 })
                .withFirstPP(2, 2)
                .build();
            state.players.first.permPP = 2;

            const effect = {
                op: "pp" as const,
                action: "gain_max",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.permPP).toBe(3);
            expect(state.players.first.maxPP).toBe(
                state.roundCount + state.players.first.permPP,
            );
        });

        it("max PP caps at 10", () => {
            givenGameState({ seed: 1, roundCount: 9 })
                .withFirstPP(9, 9)
                .build();
            state.players.first.permPP = 9;

            const effect = {
                op: "pp" as const,
                action: "gain_max",
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.permPP).toBeLessThanOrEqual(10);
            expect(state.players.first.maxPP).toBeLessThanOrEqual(10);
        });
    });

    // ===========================================================================
    // EDGE CASES
    // ===========================================================================

    describe("edge cases", () => {
        it("recover 0 PP does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstPP(5, 10)
                .build();

            const effect = {
                op: "pp" as const,
                action: "recover",
                amount: 0,
            };
            whenRunEffects([effect], "first");

            expect(thenPP("first")).toBe(5);
        });
    });
});
