/**
 * @file Mechanic Contract Test: deck operations
 *
 * DESIGN: Tests deck manipulation operations.
 *
 * INVARIANTS UNDER TEST:
 * - Shuffle randomizes order (deterministically)
 * - Add to deck places cards
 * - Deck size changes correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: deck", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // ADD TO DECK
    // ===========================================================================

    describe("add to deck", () => {
        it("adds named card to deck", () => {
            givenGameState({ seed: 1 }).build();

            const deckBefore = state.players.first.deck.length;

            const effect = {
                op: "deck" as const,
                action: "add",
                name: "Knight",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.deck.length).toBe(deckBefore + 1);
        });

        it("adds multiple cards to deck", () => {
            givenGameState({ seed: 1 }).build();

            const deckBefore = state.players.first.deck.length;

            const effect = {
                op: "deck" as const,
                action: "add",
                name: "Knight",
                count: 3,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.deck.length).toBe(deckBefore + 3);
        });
    });

    // ===========================================================================
    // SHUFFLE
    // ===========================================================================

    describe("shuffle", () => {
        it("shuffle is deterministic with same seed", () => {
            const orders: string[] = [];

            for (let run = 0; run < 2; run++) {
                resetUidCounter();
                givenGameState({ seed: 42 })
                    .withFirstDeck([
                        { name: "A", type: "Follower", attack: 1, defense: 1 },
                        { name: "B", type: "Follower", attack: 2, defense: 2 },
                        { name: "C", type: "Follower", attack: 3, defense: 3 },
                        { name: "D", type: "Follower", attack: 4, defense: 4 },
                        { name: "E", type: "Follower", attack: 5, defense: 5 },
                    ])
                    .build();

                const effect = {
                    op: "deck" as const,
                    action: "shuffle",
                };
                whenRunEffects([effect], "first");

                const order = state.players.first.deck.map(c => c.name).join(",");
                orders.push(order);
            }

            expect(orders[0]).toBe(orders[1]);
        });
    });

    // ===========================================================================
    // PUT ON TOP
    // ===========================================================================

    describe("put on top", () => {
        it("puts card on top of deck", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "Bottom", type: "Follower", attack: 1, defense: 1 },
                ])
                .build();

            const effect = {
                op: "deck" as const,
                action: "add_top",
                name: "Top",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // First card in deck should be "Top"
            expect(state.players.first.deck[0].name).toBe("Top");
        });
    });
});
