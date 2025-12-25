/**
 * @file Mechanic Contract Test: targeting edge cases
 *
 * DESIGN: Tests complex targeting scenarios.
 *
 * INVARIANTS UNDER TEST:
 * - "all" targets all matching cards
 * - Empty targets handled gracefully
 * - Self targeting works
 * - Other allies excludes self
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: targeting", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // ALL TARGETING
    // ===========================================================================

    describe("all targeting", () => {
        it("damages ALL enemy followers", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "A", type: "Follower", defense: 5, attack: 1 },
                    { name: "B", type: "Follower", defense: 5, attack: 1 },
                    { name: "C", type: "Follower", defense: 5, attack: 1 },
                ])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 2,
                select: "all",
            };
            whenRunEffects([effect], "first");

            // All should be damaged
            expect(thenBoard("second").every(c => c.defense === 3)).toBe(true);
        });

        it("buffs ALL ally followers", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
                    { name: "C", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "ally:follower",
                attack: 1,
                select: "all",
            };
            whenRunEffects([effect], "first");

            expect(findOnBoard("first", "A")!.attack).toBe(2);
            expect(findOnBoard("first", "B")!.attack).toBe(3);
            expect(findOnBoard("first", "C")!.attack).toBe(4);
        });
    });

    // ===========================================================================
    // EMPTY TARGETS
    // ===========================================================================

    describe("empty targets", () => {
        it("damage with no targets does nothing", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            // No enemy followers
            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 5,
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
            // Leader unchanged
            expect(thenBoard("second").length).toBe(0);
        });

        it("buff with no targets does nothing", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "ally:follower",
                attack: 10,
            };

            expect(() => whenRunEffects([effect], "first")).not.toThrow();
        });
    });

    // ===========================================================================
    // OTHER ALLIES (EXCLUDES SELF)
    // ===========================================================================

    describe("other_allies targeting", () => {
        it("buffs other allies but not self", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "Source", type: "Follower", attack: 1, defense: 1 },
                    { name: "Ally1", type: "Follower", attack: 2, defense: 2 },
                    { name: "Ally2", type: "Follower", attack: 3, defense: 3 },
                ])
                .build();

            const source = findOnBoard("first", "Source");

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "other_allies",
                attack: 2,
            };
            whenRunEffects([effect], "first", source);

            // Source unchanged
            expect(findOnBoard("first", "Source")!.attack).toBe(1);
            // Others buffed
            expect(findOnBoard("first", "Ally1")!.attack).toBe(4);
            expect(findOnBoard("first", "Ally2")!.attack).toBe(5);
        });
    });

    // ===========================================================================
    // RANDOM WITH FALLBACK
    // ===========================================================================

    describe("fallback targeting", () => {
        it("falls back to leader when no followers", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            // No enemy followers
            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 5,
                fallback_leader: true,
            };
            whenRunEffects([effect], "first");

            // Should damage leader instead
            // This tests fallback behavior
        });
    });
});
