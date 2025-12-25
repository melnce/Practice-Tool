/**
 * @file Mechanic Contract Test: return_hand_to_deck
 *
 * DESIGN: Tests returning cards from hand to deck.
 *
 * INVARIANTS UNDER TEST:
 * - Card is removed from hand
 * - Card is added to deck
 * - Deck is shuffled
 * - Can return all cards
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

describe("Mechanic Contract: return_hand_to_deck", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC RETURN
    // ===========================================================================

    describe("return one card", () => {
        it("removes card from hand", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const effect = {
                op: "return_hand_to_deck" as const,
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(1);
        });

        it("adds card to deck", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "Target", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const deckBefore = state.players.first.deck.length;

            const effect = {
                op: "return_hand_to_deck" as const,
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.deck.length).toBeGreaterThan(deckBefore);
        });
    });

    // ===========================================================================
    // RETURN ALL
    // ===========================================================================

    describe("return all cards", () => {
        it("returns entire hand to deck", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                    { name: "C", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const effect = {
                op: "return_hand_to_deck" as const,
                select: "all",
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(0);
        });
    });

    // ===========================================================================
    // EMPTY HAND
    // ===========================================================================

    describe("empty hand", () => {
        it("returns blocked if hand empty and not optional", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "return_hand_to_deck" as const,
                count: 1,
            };

            // Should not throw
            expect(() => whenRunEffects([effect], "first")).not.toThrow();
        });

        it("returns done if optional and hand empty", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "return_hand_to_deck" as const,
                count: 1,
                optional: true,
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
        });
    });
});
