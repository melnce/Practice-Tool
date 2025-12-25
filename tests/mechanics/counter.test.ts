/**
 * @file Mechanic Contract Test: counter mechanics
 *
 * DESIGN: Tests counter operations (shadows, rally, crest, etc.)
 *
 * INVARIANTS UNDER TEST:
 * - Counters increment/decrement correctly
 * - Counters are per-player
 * - Counters cannot go below 0
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: counters", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // SHADOWS
    // ===========================================================================

    describe("shadows counter", () => {
        it("add_shadows increases shadow count", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 5;

            const effect = {
                op: "counter" as const,
                counter: "shadows",
                action: "add",
                amount: 3,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.shadows).toBe(8);
        });

        it("shadows are per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 10;
            state.players.second.shadows = 5;

            const effect = {
                op: "counter" as const,
                counter: "shadows",
                action: "add",
                amount: 3,
            };
            whenRunEffects([effect], "first");

            // Only first player increases
            expect(state.players.first.shadows).toBe(13);
            expect(state.players.second.shadows).toBe(5);
        });
    });

    // ===========================================================================
    // RALLY
    // ===========================================================================

    describe("rally counter", () => {
        it("rally increments on follower play", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.rally = 5;

            const effect = {
                op: "counter" as const,
                counter: "rally",
                action: "add",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.rally).toBe(6);
        });

        it("rally is per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.rally = 8;
            state.players.second.rally = 3;

            const effect = {
                op: "counter" as const,
                counter: "rally",
                action: "add",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.rally).toBe(10);
            expect(state.players.second.rally).toBe(3);
        });
    });

    // ===========================================================================
    // CREST (FAITH)
    // ===========================================================================

    describe("crest counter", () => {
        it("increments crest count", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.crest = 0;

            const effect = {
                op: "counter" as const,
                counter: "crest",
                action: "add",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.crest).toBe(1);
        });

        it("crest is per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.crest = 2;
            state.players.second.crest = 1;

            const effect = {
                op: "counter" as const,
                counter: "crest",
                action: "add",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.crest).toBe(3);
            expect(state.players.second.crest).toBe(1);
        });
    });

    // ===========================================================================
    // EDGE CASES
    // ===========================================================================

    describe("edge cases", () => {
        it("counter cannot go below 0", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 3;

            const effect = {
                op: "counter" as const,
                counter: "shadows",
                action: "subtract",
                amount: 10,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.shadows).toBeGreaterThanOrEqual(0);
        });

        it("adding 0 does nothing", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.rally = 5;

            const effect = {
                op: "counter" as const,
                counter: "rally",
                action: "add",
                amount: 0,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.rally).toBe(5);
        });
    });
});
