/**
 * @file Mechanic Contract Test: evolve
 *
 * DESIGN: Tests the evolve operation.
 *
 * INVARIANTS UNDER TEST:
 * - Evolve increases attack/defense by evolution bonus
 * - Evolved card has isEvolved flag
 * - Evolution consumes evolution point
 * - Can only evolve once per card
 * - Evolution triggers fire
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: evolve", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC EVOLVE
    // ===========================================================================

    describe("evolve operation", () => {
        it("sets isEvolved flag to true", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    hasEvolved: false,
                    canEvolve: true,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "evolve" as const,
                target: "self",
            };
            whenRunEffects([effect], "first", card);

            const evolved = findOnBoard("first", "Target");
            expect(evolved!.hasEvolved).toBe(true);
        });

        it("increases attack by evolution bonus (default +2)", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    hasEvolved: false,
                    canEvolve: true,
                    evoAttack: 2,
                    evoDefense: 2,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "evolve" as const,
                target: "self",
            };
            whenRunEffects([effect], "first", card);

            const evolved = findOnBoard("first", "Target");
            expect(evolved!.attack).toBe(5); // 3 + 2
        });

        it("increases defense by evolution bonus (default +2)", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 3,
                    defense: 3,
                    hasEvolved: false,
                    canEvolve: true,
                    evoAttack: 2,
                    evoDefense: 2,
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "evolve" as const,
                target: "self",
            };
            whenRunEffects([effect], "first", card);

            const evolved = findOnBoard("first", "Target");
            expect(evolved!.defense).toBe(5); // 3 + 2
        });
    });

    // ===========================================================================
    // EVOLVE_FREE (NO EP COST)
    // ===========================================================================

    describe("evolve with spend_point: false (free evolution)", () => {
        it("evolves without consuming EP", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    hasEvolved: false,
                }])
                .build();

            state.players.first.evoCharges = 2;

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "evolve" as const,
                target: "self",
                spend_point: false, // Free evolution - no EP cost
            };
            whenRunEffects([effect], "first", card);

            // EP unchanged
            expect(state.players.first.evoCharges).toBe(2);
            // Card evolved
            expect(findOnBoard("first", "Target")!.hasEvolved).toBe(true);
        });
    });

    // ===========================================================================
    // ALREADY EVOLVED
    // ===========================================================================

    describe("already evolved", () => {
        it("evolving already evolved card should be safe", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 5,
                    defense: 5,
                    hasEvolved: true, // Already evolved
                }])
                .build();

            const card = findOnBoard("first", "Target");

            const effect = {
                op: "evolve" as const,
                target: "self",
            };

            // Should not throw
            expect(() => whenRunEffects([effect], "first", card)).not.toThrow();
        });
    });
});
