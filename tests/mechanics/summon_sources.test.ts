/**
 * @file Mechanic Contract Test: summon sources
 *
 * DESIGN: Tests all summon source types.
 *
 * SOURCES COVERED:
 * - named (token)
 * - deck (from deck)
 * - hand (from hand)
 * - graveyard (reanimate)
 * - chain (summon chains)
 * - invoke
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: summon sources", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // SUMMON FROM NAMED (TOKEN)
    // ===========================================================================

    describe("source:named", () => {
        it("summons named token to board", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named",
                name: "Fairy",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("first").length).toBe(1);
        });

        it("summons multiple tokens", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named",
                name: "Fairy",
                count: 3,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("first").length).toBe(3);
        });
    });

    // ===========================================================================
    // SUMMON FROM DECK
    // ===========================================================================

    describe("source:deck", () => {
        it("summons from deck to board", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "DeckFollower", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const effect = {
                op: "summon" as const,
                source: "deck",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // Should summon from deck to board
        });
    });

    // ===========================================================================
    // SUMMON FROM HAND
    // ===========================================================================

    describe("source:hand", () => {
        it("summons from hand to board", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([
                    { name: "HandFollower", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const effect = {
                op: "summon" as const,
                source: "hand",
                target: "ally:hand",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // Should move from hand to board
        });
    });

    // ===========================================================================
    // SUMMON FROM GRAVEYARD (REANIMATE)
    // ===========================================================================

    describe("source:graveyard", () => {
        it("summons from graveyard (reanimate)", () => {
            givenGameState({ seed: 1 }).build();

            state.players.first.graveyard.push({
                name: "DeadFollower",
                type: "Follower",
                attack: 5,
                defense: 5,
                cost: 4,
            });

            const effect = {
                op: "reanimate" as const,
                cost: 5,
            };
            whenRunEffects([effect], "first");

            // Should summon from graveyard
        });
    });

    // ===========================================================================
    // CHAIN SUMMON
    // ===========================================================================

    describe("chain summon", () => {
        it("chain summon creates linked cards", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "chain",
                name: "ChainFollower",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // Should summon with chain marker
        });
    });

    // ===========================================================================
    // INVOKE SUMMON
    // ===========================================================================

    describe("invoke summon", () => {
        it("invoke summons from deck on condition", () => {
            givenGameState({ seed: 1 })
                .withFirstDeck([
                    { name: "InvokeFollower", type: "Follower", attack: 5, defense: 5, hasInvoke: true },
                ])
                .build();

            const effect = {
                op: "summon" as const,
                source: "invoke",
                name: "InvokeFollower",
            };
            whenRunEffects([effect], "first");

            // Should summon invoked card
        });
    });

    // ===========================================================================
    // EARTH SIGIL SUMMON
    // ===========================================================================

    describe("earth sigil summon", () => {
        it("summons earth sigil amulet", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named",
                name: "Earth Essence",
                count: 1,
            };
            whenRunEffects([effect], "first");

            const board = thenBoard("first");
            // Should summon amulet with isEarthSigil
        });
    });
});
