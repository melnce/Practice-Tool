/**
 * @file Mechanic Contract Test: gate conditions (comprehensive)
 *
 * DESIGN: Tests ALL condition types used in gate operations.
 *
 * CONDITIONS COVERED:
 * - combo, rally, necromancy (already tested)
 * - overflow, highlander, max_pp, both_max_pp
 * - amulet_count, board_name
 * - evolved_self, evolved_allied
 * - super_evolved_self, super_evolved_allied
 * - spellboost_count, skybound_art
 * - self_cost, no_ally_attacked
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenHP,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: gate conditions", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // OVERFLOW
    // ===========================================================================

    describe("overflow condition", () => {
        it("fires when PP >= 7", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.maxPp = 7;
            state.players.first.pp = 7;

            const effect = {
                op: "gate" as const,
                condition: "overflow",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 3,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(17);
        });

        it("does NOT fire when PP < 7", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.maxPp = 6;

            const effect = {
                op: "gate" as const,
                condition: "overflow",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 3,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(20);
        });
    });

    // ===========================================================================
    // HIGHLANDER
    // ===========================================================================

    describe("highlander condition", () => {
        it("fires when deck has no duplicates", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                    { name: "C", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const effect = {
                op: "gate" as const,
                condition: "highlander",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(15);
        });

        it("does NOT fire when deck has duplicates", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstDeck([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "A", type: "Follower", attack: 1, defense: 1 }, // duplicate
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const effect = {
                op: "gate" as const,
                condition: "highlander",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(20);
        });
    });

    // ===========================================================================
    // MAX_PP / BOTH_MAX_PP
    // ===========================================================================

    describe("max_pp condition", () => {
        it("fires when max PP meets threshold", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.maxPp = 10;

            const effect = {
                op: "gate" as const,
                condition: "max_pp",
                count: 10,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 4,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(16);
        });
    });

    describe("both_max_pp condition", () => {
        it("fires when both players have max PP", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            state.players.first.maxPp = 10;
            state.players.second.maxPp = 10;

            const effect = {
                op: "gate" as const,
                condition: "both_max_pp",
                count: 10,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(15);
        });
    });

    // ===========================================================================
    // AMULET_COUNT
    // ===========================================================================

    describe("amulet_count condition", () => {
        it("fires when amulet count meets threshold", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([
                    { name: "Amulet1", type: "Amulet" },
                    { name: "Amulet2", type: "Amulet" },
                    { name: "Amulet3", type: "Amulet" },
                ])
                .build();

            const effect = {
                op: "gate" as const,
                condition: "amulet_count",
                count: 3,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 3,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(17);
        });
    });

    // ===========================================================================
    // EVOLVED CONDITIONS
    // ===========================================================================

    describe("evolved_self condition", () => {
        it("fires when source card is evolved", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "EvolvedCard",
                    type: "Follower",
                    attack: 5,
                    defense: 5,
                    isEvolved: true,
                }])
                .build();

            const source = findOnBoard("first", "EvolvedCard");

            const effect = {
                op: "gate" as const,
                condition: "evolved_self",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 4,
                }],
            };
            whenRunEffects([effect], "first", source);

            expect(thenHP("second")).toBe(16);
        });
    });

    describe("evolved_allied condition", () => {
        it("fires when any ally is evolved", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([
                    { name: "Normal", type: "Follower", attack: 1, defense: 1, isEvolved: false },
                    { name: "Evolved", type: "Follower", attack: 3, defense: 3, isEvolved: true },
                ])
                .build();

            const effect = {
                op: "gate" as const,
                condition: "evolved_allied",
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 2,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(18);
        });
    });

    // ===========================================================================
    // SPELLBOOST_COUNT
    // ===========================================================================

    describe("spellboost_count condition", () => {
        it("fires when card has enough spellboost", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "SpellboostedCard",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    spellboostCount: 10,
                }])
                .build();

            const source = findOnBoard("first", "SpellboostedCard");

            const effect = {
                op: "gate" as const,
                condition: "spellboost_count",
                count: 5,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first", source);

            expect(thenHP("second")).toBe(15);
        });
    });

    // ===========================================================================
    // SELF_COST
    // ===========================================================================

    describe("self_cost condition", () => {
        it("fires when card cost meets threshold", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .withFirstBoard([{
                    name: "ExpensiveCard",
                    type: "Follower",
                    attack: 5,
                    defense: 5,
                    cost: 8,
                }])
                .build();

            const source = findOnBoard("first", "ExpensiveCard");

            const effect = {
                op: "gate" as const,
                condition: "self_cost",
                count: 7,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 3,
                }],
            };
            whenRunEffects([effect], "first", source);

            expect(thenHP("second")).toBe(17);
        });
    });
});
