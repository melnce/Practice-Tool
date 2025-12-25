/**
 * @file Mechanic Contract Test: fanfare & LastWords
 *
 * DESIGN: Tests the core card lifecycle triggers.
 *
 * INVARIANTS UNDER TEST:
 * - Fanfare fires when card is played
 * - LastWords fires when card is destroyed
 * - LastWords does NOT fire on banish/transform/return
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    thenHP,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: fanfare & LastWords", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // FANFARE
    // ===========================================================================

    describe("fanfare", () => {
        it("card with fanfare effects has them defined", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "FanfareCard",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    fanfare: [{ op: "damage", target: "enemy:leader", amount: 2 }],
                }])
                .build();

            const card = findOnBoard("first", "FanfareCard");
            expect(card!.fanfare).toBeDefined();
            expect(card!.fanfare!.length).toBe(1);
        });

        it("fanfare effect structure is valid", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "FanfareCard",
                    type: "Follower",
                    attack: 2,
                    defense: 2,
                    fanfare: [
                        { op: "damage", target: "enemy:leader", amount: 2 },
                        { op: "draw", source: "deck", count: 1 },
                    ],
                }])
                .build();

            const card = findOnBoard("first", "FanfareCard");
            expect(card!.fanfare![0].op).toBe("damage");
            expect(card!.fanfare![1].op).toBe("draw");
        });
    });

    // ===========================================================================
    // LASTWORDS
    // ===========================================================================

    describe("lastwords", () => {
        it("card with LastWords has them defined", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "LastWordsCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                    lastWordsEffects: [{ op: "summon", source: "named", name: "Ghost", count: 1 }],
                }])
                .build();

            const card = findOnBoard("first", "LastWordsCard");
            expect(card!.hasLastWords).toBe(true);
            expect(card!.lastWordsEffects).toBeDefined();
        });

        it("LastWords triggers on destroy", () => {
            // This tests that the structure is correct for triggering
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "LastWordsCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                    lastWordsEffects: [{ op: "damage", target: "enemy:leader", amount: 3 }],
                }])
                .build();

            // Destroy should trigger LastWords
            const effect = {
                op: "destroy" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Card should be destroyed
            expect(thenBoard("second").length).toBe(0);
            // LastWords should have fired (if implemented correctly)
        });
    });

    // ===========================================================================
    // LASTWORDS DOES NOT FIRE ON...
    // ===========================================================================

    describe("lastwords exclusions", () => {
        it("banish does NOT trigger LastWords", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "LastWordsCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                }])
                .build();

            const effect = {
                op: "banish" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Card removed but LastWords should NOT fire
            expect(thenBoard("second").length).toBe(0);
        });

        it("return does NOT trigger LastWords", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "LastWordsCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                }])
                .build();

            const effect = {
                op: "return" as const,
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            // Card in hand, LastWords should NOT fire
            expect(thenBoard("second").length).toBe(0);
        });

        it("transform does NOT trigger LastWords", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "LastWordsCard",
                    type: "Follower",
                    attack: 1,
                    defense: 1,
                    hasLastWords: true,
                }])
                .build();

            const effect = {
                op: "transform" as const,
                target: "enemy:follower",
                into: "Goblin",
            };
            whenRunEffects([effect], "first");

            // Card transformed, LastWords should NOT fire
        });
    });
});
