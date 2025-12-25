/**
 * @file Mechanic Contract Test: draw (STRENGTHENED)
 *
 * DESIGN: Tests the draw operation for card acquisition with rigorous edge cases.
 *
 * INVARIANTS UNDER TEST:
 * - Cards move from deck to hand (zone changes)
 * - Hand size increases by draw count
 * - Deck size decreases by draw count
 * - Named tokens are created in hand with correct properties
 * - Drawing doesn't affect opponent
 * - Empty deck handling
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

describe("Mechanic Contract: draw", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // DRAW FROM DECK
    // ===========================================================================

    describe("draw from deck", () => {
        it("moves card from deck to hand", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Card1", type: "Follower", attack: 1, defense: 1 },
                    { name: "Card2", type: "Follower", attack: 2, defense: 2 },
                    { name: "Card3", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const deckSizeBefore = state.players.first.deck.length;

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(1);
            expect(state.players.first.deck.length).toBe(deckSizeBefore - 1);
        });

        it("drawn card has zone property updated to hand", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Card1", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 1,
            };
            whenRunEffects([effect], "first");

            const drawnCard = thenHand("first")[0];
            expect(drawnCard.zone).toBe("hand");
        });

        it("draws multiple cards", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 1, defense: 1 },
                    { name: "C", type: "Follower", attack: 1, defense: 1 },
                    { name: "D", type: "Follower", attack: 1, defense: 1 },
                    { name: "E", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 3,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(3);
            expect(state.players.first.deck.length).toBe(2);
        });

        it("does not overdraw if deck is smaller than count", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 5,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBeLessThanOrEqual(2);
            expect(state.players.first.deck.length).toBe(0);
        });

        it("drawing from empty deck draws nothing", () => {
            givenGameState({ seed: 1 }).build();
            // Deck is empty by default

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 3,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(0);
        });

        it("draw does NOT affect opponent's hand", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Card1", type: "Follower", attack: 1, defense: 1 },
                ])
                .withSecondHand([
                    { name: "EnemyCard", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // First player draws
            expect(thenHand("first").length).toBe(1);
            // Second player's hand unchanged
            expect(thenHand("second").length).toBe(1);
            expect(thenHand("second")[0].name).toBe("EnemyCard");
        });

        it("draw 0 does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Card1", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 0,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(0);
            expect(state.players.first.deck.length).toBe(1);
        });
    });

    // ===========================================================================
    // DRAW NAMED (ADD TOKEN TO HAND)
    // ===========================================================================

    describe("draw named token", () => {
        it("adds named token to hand", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "draw" as const,
                source: "named",
                name: "Fairy",
                count: 1,
            };
            whenRunEffects([effect], "first");

            const hand = thenHand("first");
            expect(hand.length).toBe(1);
            expect(hand[0].name).toBe("Fairy");
        });

        it("adds multiple named tokens", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "draw" as const,
                source: "named",
                name: "Fairy",
                count: 2,
            };
            whenRunEffects([effect], "first");

            const hand = thenHand("first");
            expect(hand.length).toBe(2);
            expect(hand.every(c => c.name === "Fairy")).toBe(true);
        });

        it("named token has correct zone (hand)", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "draw" as const,
                source: "named",
                name: "Fairy",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first")[0].zone).toBe("hand");
        });

        it("named token has correct owner", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "draw" as const,
                source: "named",
                name: "Fairy",
                count: 1,
            };
            whenRunEffects([effect], "second");

            expect(thenHand("second")[0].owner).toBe("second");
        });

        it("each named token has unique UID", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "draw" as const,
                source: "named",
                name: "Fairy",
                count: 3,
            };
            whenRunEffects([effect], "first");

            const uids = thenHand("first").map(c => c.uid);
            const uniqueUids = new Set(uids);
            expect(uniqueUids.size).toBe(3);
        });
    });
});
