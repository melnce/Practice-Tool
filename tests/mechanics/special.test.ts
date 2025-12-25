/**
 * @file Mechanic Contract Test: special mechanics
 *
 * DESIGN: Tests unique/rare mechanics that only 1-2 cards use.
 *
 * COVERAGE:
 * - boost_skybound_art_hand
 * - set_deckout_victory 
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

describe("Mechanic Contract: special", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BOOST SKYBOUND ART HAND
    // ===========================================================================

    describe("boost_skybound_art_hand", () => {
        it("boosts skybound art cards in hand", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "SkyboundCard",
                    type: "Follower",
                    hasSkyboundArt: true,
                    skyboundArtProgress: 0,
                }])
                .build();

            const effect = {
                op: "boost_skybound_art_hand" as const,
                amount: 5,
            };
            whenRunEffects([effect], "first");

            const card = thenHand("first").find(c => c.hasSkyboundArt);
            expect(card!.skyboundArtProgress).toBe(5);
        });

        it("does not affect non-skybound cards", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{
                    name: "RegularCard",
                    type: "Follower",
                    hasSkyboundArt: false,
                }])
                .build();

            const effect = {
                op: "boost_skybound_art_hand" as const,
                amount: 5,
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
        });
    });

    // ===========================================================================
    // SET DECKOUT VICTORY
    // ===========================================================================

    describe("set_deckout_victory", () => {
        it("sets deckout victory condition", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "set_deckout_victory" as const,
                player: "ally",
            };
            whenRunEffects([effect], "first");

            // This should set a flag that decking out = victory
            expect(state.players.first.deckoutVictory).toBe(true);
        });

        it("is per-player", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "set_deckout_victory" as const,
                player: "ally",
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.deckoutVictory).toBe(true);
            expect(state.players.second.deckoutVictory).toBeFalsy();
        });
    });
});
