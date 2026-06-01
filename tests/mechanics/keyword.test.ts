/**
 * @file Mechanic Contract Test: keyword (STRENGTHENED)
 *
 * DESIGN: Tests the keyword operation with rigorous edge cases.
 *
 * NOTE (shallow coverage): Grant/remove tests assert flag fields on board cards,
 * not combat behavior (Storm attack rules, Ward blocking, etc.). Deepen later.
 *
 * INVARIANTS UNDER TEST:
 * - Keywords are correctly added
 * - Keywords are correctly removed
 * - Silence removes ALL keywords (not just some)
 * - Multiple keywords granted at once
 * - Keyword changes target correct player
 * - Granting keyword AGAIN has no adverse effect
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    findOnBoard,
    thenBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: keyword", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // GRANT KEYWORD
    // ===========================================================================

    describe("grant action", () => {
        it("grants Ward to follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: false,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Ward"],
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.hasWard).toBe(true);
        });

        it("grants Rush to follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasRush: false,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Rush"],
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.hasRush || target!.isRush).toBe(true);
        });

        it("grants Storm to follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasStorm: false,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Storm"],
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.hasStorm).toBe(true);
        });

        it("grants multiple keywords at once", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: false,
                    hasStorm: false,
                    hasBane: false,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Ward", "Storm", "Bane"],
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.hasWard).toBe(true);
            expect(target!.hasStorm).toBe(true);
            expect(target!.hasBane).toBe(true);
        });

        it("granting keyword to all allies affects all allies", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "A", type: "Follower", attack: 1, defense: 1, hasWard: false },
                    { name: "B", type: "Follower", attack: 2, defense: 2, hasWard: false },
                    { name: "C", type: "Follower", attack: 3, defense: 3, hasWard: false },
                ])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Ward"],
            };
            whenRunEffects([effect], "first");

            expect(findOnBoard("first", "A")!.hasWard).toBe(true);
            expect(findOnBoard("first", "B")!.hasWard).toBe(true);
            expect(findOnBoard("first", "C")!.hasWard).toBe(true);
        });

        it("granting keyword does NOT affect enemy followers", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Ally", type: "Follower", attack: 1, defense: 1, hasWard: false }])
                .withSecondBoard([{ name: "Enemy", type: "Follower", attack: 1, defense: 1, hasWard: false }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Ward"],
            };
            whenRunEffects([effect], "first");

            expect(findOnBoard("first", "Ally")!.hasWard).toBe(true);
            expect(findOnBoard("second", "Enemy")!.hasWard).toBeFalsy();
        });

        it("granting keyword AGAIN when already present is safe", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: true, // Already has Ward
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "grant",
                target: "ally:follower",
                keywords: ["Ward"],
            };

            // Should not throw or cause issues
            expect(() => whenRunEffects([effect], "first")).not.toThrow();

            const target = findOnBoard("first", "Target");
            expect(target!.hasWard).toBe(true);
        });
    });

    // ===========================================================================
    // REMOVE KEYWORD
    // ===========================================================================

    describe("remove action", () => {
        it("removes Ward from follower", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: true,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "remove",
                target: "enemy:follower",
                keywords: ["Ward"],
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            expect(target!.hasWard).toBeFalsy();
        });

        it("removing keyword that doesn't exist is safe", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: false, // Doesn't have Ward
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "remove",
                target: "enemy:follower",
                keywords: ["Ward"],
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
            expect(findOnBoard("second", "Target")!.hasWard).toBeFalsy();
        });

        it("removes only specified keyword, leaves others", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: true,
                    hasBane: true,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "remove",
                target: "enemy:follower",
                keywords: ["Ward"],
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            expect(target!.hasWard).toBeFalsy();
            expect(target!.hasBane).toBe(true); // Bane unchanged
        });
    });

    // ===========================================================================
    // SILENCE
    // ===========================================================================

    describe("silence action", () => {
        it("removes all keywords from follower", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    hasWard: true,
                    hasRush: true,
                    hasBane: true,
                    hasStorm: true,
                    hasLastWords: true,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "silence",
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            expect(target!.hasWard).toBeFalsy();
            expect(target!.hasRush).toBeFalsy();
            expect(target!.hasBane).toBeFalsy();
            expect(target!.hasStorm).toBeFalsy();
            expect(target!.hasLastWords).toBeFalsy();
        });

        it("silence does NOT change stats", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 5,
                    defense: 7,
                    hasWard: true,
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "silence",
                target: "enemy:follower",
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            // Keywords removed
            expect(target!.hasWard).toBeFalsy();
            // Stats unchanged
            expect(target!.attack).toBe(5);
            expect(target!.defense).toBe(7);
        });

        it("silencing follower with no keywords is safe", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{
                    name: "Target",
                    type: "Follower",
                    attack: 2,
                    defense: 3,
                    // No keywords
                }])
                .build();

            const effect = {
                op: "keyword" as const,
                action: "silence",
                target: "enemy:follower",
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
        });
    });
});
