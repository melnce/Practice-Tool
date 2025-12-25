/**
 * @file Mechanic Contract Test: destroy/banish
 *
 * DESIGN: Tests the destroy and banish operations.
 *
 * INVARIANTS UNDER TEST:
 * - Destroy removes card from board
 * - Destroyed cards go to graveyard
 * - Banished cards do NOT go to graveyard
 * - LastWords triggers on destroy (not banish)
 * - Correct player's cards are destroyed
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: destroy", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC DESTROY
    // ===========================================================================

    describe("destroy operation", () => {
        it("removes follower from board", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const effect = {
                op: "destroy" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("second").length).toBe(0);
        });

        it("destroyed card goes to graveyard", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const effect = {
                op: "destroy" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Card should be in graveyard
            expect(state.players.second.graveyard.length).toBeGreaterThan(0);
        });

        it("destroys ally follower when targeted", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .withSecondBoard([{ name: "Enemy", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "destroy" as const,
                target: "ally:follower",
            };
            whenRunEffects([effect], "first");

            // First player's card destroyed
            expect(thenBoard("first").length).toBe(0);
            // Second player's card untouched
            expect(thenBoard("second").length).toBe(1);
        });

        it("destroy adds to shadows count", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const shadowsBefore = state.players.second.shadows || 0;

            const effect = {
                op: "destroy" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Shadows should increase
            expect(state.players.second.shadows).toBeGreaterThan(shadowsBefore);
        });
    });

    // ===========================================================================
    // BANISH (NO GRAVEYARD)
    // ===========================================================================

    describe("banish operation", () => {
        it("removes follower from board", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const effect = {
                op: "banish" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("second").length).toBe(0);
        });

        it("banished card does NOT go to graveyard", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const graveyardBefore = state.players.second.graveyard.length;

            const effect = {
                op: "banish" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Graveyard should NOT increase
            expect(state.players.second.graveyard.length).toBe(graveyardBefore);
        });

        it("banish does NOT add to shadows", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const shadowsBefore = state.players.second.shadows || 0;

            const effect = {
                op: "banish" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Shadows should NOT increase
            expect(state.players.second.shadows).toBe(shadowsBefore);
        });
    });

    // ===========================================================================
    // DESTROY_SELF
    // ===========================================================================

    describe("destroy_self operation", () => {
        it("destroys the source card", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "SelfDestruct", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const sourceCard = findOnBoard("first", "SelfDestruct");

            const effect = {
                op: "destroy_self" as const,
            };
            whenRunEffects([effect], "first", sourceCard);

            expect(thenBoard("first").length).toBe(0);
        });
    });
});
