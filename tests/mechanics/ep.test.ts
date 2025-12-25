/**
 * @file Mechanic Contract Test: EP (evolution points)
 *
 * DESIGN: Tests evolution point operations.
 *
 * INVARIANTS UNDER TEST:
 * - Gain EP increases count
 * - Consume EP decreases count
 * - EP cannot go below 0
 * - EP is per-player
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: EP", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // GAIN EP
    // ===========================================================================

    describe("gain EP", () => {
        it("increases evolution points", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.evolutionPoints = 2;

            const effect = {
                op: "ep" as const,
                action: "gain",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.evolutionPoints).toBe(3);
        });

        it("EP is per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.evolutionPoints = 2;
            state.players.second.evolutionPoints = 1;

            const effect = {
                op: "ep" as const,
                action: "gain",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.evolutionPoints).toBe(3);
            expect(state.players.second.evolutionPoints).toBe(1);
        });
    });

    // ===========================================================================
    // CONSUME EP
    // ===========================================================================

    describe("consume EP", () => {
        it("decreases evolution points", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.evolutionPoints = 3;

            const effect = {
                op: "ep" as const,
                action: "consume",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.evolutionPoints).toBe(2);
        });

        it("EP cannot go below 0", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.evolutionPoints = 1;

            const effect = {
                op: "ep" as const,
                action: "consume",
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.evolutionPoints).toBeGreaterThanOrEqual(0);
        });
    });

    // ===========================================================================
    // SET EP
    // ===========================================================================

    describe("set EP", () => {
        it("sets EP to exact value", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.evolutionPoints = 5;

            const effect = {
                op: "ep" as const,
                action: "set",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.evolutionPoints).toBe(2);
        });
    });
});
