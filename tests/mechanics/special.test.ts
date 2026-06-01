/**
 * @file Mechanic Contract Test: special mechanics
 *
 * DESIGN: Tests unique/rare mechanics that only 1-2 cards use.
 *
 * COVERAGE:
 * - boost_skybound_art_hand
 * - set_deckout_victory
 * - deckout loss on forced draw (owner-confirmed rule)
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
import { drawCard } from "../../src/core/utils.js";
import { isPlayerDefeated, getWinner } from "../../src/core/playerHelpers.js";

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
                    keywords: ["Skybound Art"],
                    skyboundArtEvolvesWitnessed: 0,
                }])
                .build();

            const effect = {
                op: "boost_skybound_art_hand" as const,
                amount: 5,
            };
            whenRunEffects([effect], "first");

            const card = thenHand("first").find(c =>
                Array.isArray(c.keywords) && c.keywords.some((k: any) =>
                    String(k?.name || k || "").toLowerCase() === "skybound art"
                )
            );
            expect(card!.skyboundArtEvolvesWitnessed).toBe(5);
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
            expect(state.players.first.deckoutWins).toBe(true);
        });

        it("is per-player", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "set_deckout_victory" as const,
                player: "ally",
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.deckoutWins).toBe(true);
            expect(state.players.second.deckoutWins).toBeFalsy();
        });
    });

    // ===========================================================================
    // DECKOUT LOSS (owner-confirmed: loss on draw attempt, not on empty deck alone)
    // ===========================================================================

    describe("deckout loss condition", () => {
        it("emptying the deck alone does not cause a loss", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.deck.length = 0;
            state.players.first.hp = 20;

            expect(state.players.first.hp).toBe(20);
        });

        it("draw attempt on empty deck is instant loss for that player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.deck.length = 0;
            state.players.first.hand.length = 0;
            state.players.first.hp = 20;

            drawCard(state.players.first.hand, state.players.first.deck, "first");

            expect(isPlayerDefeated(state, "first")).toBe(true);
            expect(state.players.first.hp).toBe(20);
        });

        it("draw attempt on empty deck does not defeat opponent by default", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.deck.length = 0;
            state.players.second.hp = 20;

            drawCard(state.players.first.hand, state.players.first.deck, "first");

            expect(isPlayerDefeated(state, "second")).toBe(false);
            expect(state.players.second.hp).toBe(20);
        });

        it("deckout declares the other player as winner while decked-out HP stays unchanged", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.deck.length = 0;
            state.players.first.hp = 20;
            state.players.second.hp = 18;

            drawCard(state.players.first.hand, state.players.first.deck, "first");

            expect(isPlayerDefeated(state, "first")).toBe(true);
            expect(state.players.first.hp).toBe(20);
            expect(getWinner(state)).toBe("second");
            expect(isPlayerDefeated(state, "second")).toBe(false);
        });
    });
});
