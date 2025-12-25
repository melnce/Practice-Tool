/**
 * @file Mechanic Contract Test: crest (faith counter)
 *
 * DESIGN: Tests the crest/faith counter operations.
 *
 * INVARIANTS UNDER TEST:
 * - Crest increments correctly
 * - Crest is per-player
 * - Crest gates work with threshold
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

describe("Mechanic Contract: crest", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // GAIN CREST
    // ===========================================================================

    describe("gain crest", () => {
        it("increments crest counter", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.crest = 0;

            const effect = {
                op: "crest" as const,
                action: "add",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.crest).toBe(1);
        });

        it("can add multiple crest at once", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.crest = 2;

            const effect = {
                op: "crest" as const,
                action: "add",
                amount: 3,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.crest).toBe(5);
        });

        it("crest is per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.crest = 3;
            state.players.second.crest = 1;

            const effect = {
                op: "crest" as const,
                action: "add",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.crest).toBe(5);
            expect(state.players.second.crest).toBe(1);
        });
    });

    // ===========================================================================
    // CREST GATE
    // ===========================================================================

    describe("crest gate", () => {
        it("fires when crest meets threshold", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.crest = 5;

            const effect = {
                op: "gate" as const,
                condition: "crest",
                count: 5,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 3,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(17);
        });

        it("does NOT fire when crest below threshold", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.crest = 4;

            const effect = {
                op: "gate" as const,
                condition: "crest",
                count: 5,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 3,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(20);
        });
    });
});
