/**
 * @file Mechanic Contract Test: discard
 *
 * DESIGN: Tests the discard operation.
 *
 * INVARIANTS UNDER TEST:
 * - Discard removes card from hand
 * - Discarded card goes to graveyard
 * - Random discard is deterministic with seed
 * - Discard targets correct player
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenHand,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: discard", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC DISCARD
    // ===========================================================================

    describe("discard operation", () => {
        it("removes card from hand", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const effect = {
                op: "discard" as const,
                target: "ally:hand",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(1);
        });

        it("discarded card goes to graveyard", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Target", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const graveyardBefore = state.players.first.graveyard.length;

            const effect = {
                op: "discard" as const,
                target: "ally:hand",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.graveyard.length).toBeGreaterThan(graveyardBefore);
        });

        it("discards multiple cards", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                    { name: "C", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const effect = {
                op: "discard" as const,
                target: "ally:hand",
                count: 2,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(1);
        });

        it("discard targets correct player", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Ally", type: "Follower", attack: 1, defense: 1 }])
                .withSecondHand([{ name: "Enemy", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "discard" as const,
                target: "ally:hand",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // First player's hand emptied
            expect(thenHand("first").length).toBe(0);
            // Second player's hand unchanged
            expect(thenHand("second").length).toBe(1);
        });

        it("can discard enemy hand", () => {
            givenGameState({ seed: 1 })
                .withSecondHand([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const effect = {
                op: "discard" as const,
                target: "enemy:hand",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("second").length).toBe(1);
        });
    });

    // ===========================================================================
    // RANDOM DISCARD (DETERMINISTIC)
    // ===========================================================================

    describe("random discard", () => {
        it("same seed produces same random discard", () => {
            const results: string[] = [];

            for (let run = 0; run < 2; run++) {
                resetUidCounter();
                givenGameState({ seed: 42 })
                    .withFirstHand([
                        { name: "A", type: "Follower", attack: 1, defense: 1 },
                        { name: "B", type: "Follower", attack: 2, defense: 2 },
                        { name: "C", type: "Follower", attack: 3, defense: 3 },
                    ])
                    .build();

                const effect = {
                    op: "discard" as const,
                    target: "ally:hand",
                    count: 1,
                    random: true,
                };
                whenRunEffects([effect], "first");

                const remaining = thenHand("first").map(c => c.name).sort().join(",");
                results.push(remaining);
            }

            expect(results[0]).toBe(results[1]);
        });
    });

    // ===========================================================================
    // EDGE CASES
    // ===========================================================================

    describe("edge cases", () => {
        it("discard from empty hand does nothing", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "discard" as const,
                target: "ally:hand",
                count: 1,
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
        });

        it("discard 0 does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "A", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "discard" as const,
                target: "ally:hand",
                count: 0,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(1);
        });
    });
});
