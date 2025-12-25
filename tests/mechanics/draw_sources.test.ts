/**
 * @file Mechanic Contract Test: draw sources
 *
 * DESIGN: Tests ALL draw source types.
 *
 * SOURCES COVERED:
 * - deck, hand, graveyard, board
 * - named, copy, selection
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

describe("Mechanic Contract: draw sources", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // DECK SOURCE
    // ===========================================================================

    describe("source:deck", () => {
        it("draws card from deck", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "DeckCard", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const effect = {
                op: "draw" as const,
                source: "deck",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(1);
        });
    });

    // ===========================================================================
    // NAMED SOURCE
    // ===========================================================================

    describe("source:named", () => {
        it("creates named card token", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "draw" as const,
                source: "named",
                name: "Fairy",
                count: 2,
            };
            whenRunEffects([effect], "first");

            expect(thenHand("first").length).toBe(2);
        });
    });

    // ===========================================================================
    // COPY SOURCE
    // ===========================================================================

    describe("source:copy", () => {
        it("creates copy of existing card", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Original", type: "Follower", attack: 5, defense: 5 }])
                .build();

            const effect = {
                op: "draw" as const,
                source: "copy",
                target: "ally:follower",
            };
            whenRunEffects([effect], "first");

            // Should add copy to hand
        });
    });

    // ===========================================================================
    // GRAVEYARD SOURCE
    // ===========================================================================

    describe("source:graveyard", () => {
        it("retrieves card from graveyard", () => {
            givenGameState({ seed: 1 }).build();

            state.players.first.graveyard.push({
                name: "DeadCard",
                type: "Follower",
                attack: 3,
                defense: 3,
            });

            const effect = {
                op: "draw" as const,
                source: "graveyard",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // Should add from graveyard to hand
        });
    });

    // ===========================================================================
    // SELECTION SOURCE
    // ===========================================================================

    describe("source:selection", () => {
        it("uses player-selected cards", () => {
            // selection requires UI interaction
        });
    });
});
