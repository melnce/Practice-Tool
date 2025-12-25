/**
 * @file Mechanic Contract Test: select/choose
 *
 * DESIGN: Tests the select operation for targeting.
 *
 * INVARIANTS UNDER TEST:
 * - Select allows targeting specific cards
 * - Select respects count limit
 * - Random select is deterministic
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

describe("Mechanic Contract: select", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // RANDOM SELECT
    // ===========================================================================

    describe("random select", () => {
        it("select:random picks target deterministically", () => {
            const results: string[] = [];

            for (let run = 0; run < 2; run++) {
                resetUidCounter();
                givenGameState({ seed: 42 })
                    .withSecondBoard([
                        { name: "A", type: "Follower", defense: 5, attack: 1 },
                        { name: "B", type: "Follower", defense: 5, attack: 1 },
                        { name: "C", type: "Follower", defense: 5, attack: 1 },
                    ])
                    .build();

                // Effect that damages random enemy follower
                const effect = {
                    op: "damage" as const,
                    target: "enemy:follower",
                    amount: 3,
                    select: "random" as const,
                    count: 1,
                };
                whenRunEffects([effect], "first");

                const damaged = thenBoard("second").find(c => c.defense === 2);
                results.push(damaged?.name ?? "none");
            }

            expect(results[0]).toBe(results[1]);
        });
    });

    // ===========================================================================
    // SELECT MULTIPLE
    // ===========================================================================

    describe("select multiple", () => {
        it("damages up to select count", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "A", type: "Follower", defense: 5, attack: 1 },
                    { name: "B", type: "Follower", defense: 5, attack: 1 },
                    { name: "C", type: "Follower", defense: 5, attack: 1 },
                    { name: "D", type: "Follower", defense: 5, attack: 1 },
                ])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 2,
                select: 2,
            };
            whenRunEffects([effect], "first");

            // Exactly 2 should be damaged
            const damaged = thenBoard("second").filter(c => c.defense === 3);
            expect(damaged.length).toBe(2);
        });
    });

    // ===========================================================================
    // SELECT STRONGEST/WEAKEST
    // ===========================================================================

    describe("select by stat", () => {
        it("select:highest_attack targets highest attack", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "Weak", type: "Follower", defense: 5, attack: 1 },
                    { name: "Medium", type: "Follower", defense: 5, attack: 3 },
                    { name: "Strong", type: "Follower", defense: 5, attack: 7 },
                ])
                .build();

            const effect = {
                op: "destroy" as const,
                target: "enemy:follower",
                select: "highest_attack" as const,
            };
            whenRunEffects([effect], "first");

            // Strong should be destroyed
            expect(findOnBoard("second", "Strong")).toBeUndefined();
            expect(findOnBoard("second", "Weak")).toBeDefined();
            expect(findOnBoard("second", "Medium")).toBeDefined();
        });

        it("select:lowest_defense targets lowest defense", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "Weak", type: "Follower", defense: 1, attack: 5 },
                    { name: "Medium", type: "Follower", defense: 3, attack: 5 },
                    { name: "Strong", type: "Follower", defense: 5, attack: 5 },
                ])
                .build();

            const effect = {
                op: "destroy" as const,
                target: "enemy:follower",
                select: "lowest_defense" as const,
            };
            whenRunEffects([effect], "first");

            // Weak should be destroyed
            expect(findOnBoard("second", "Weak")).toBeUndefined();
            expect(findOnBoard("second", "Medium")).toBeDefined();
            expect(findOnBoard("second", "Strong")).toBeDefined();
        });
    });
});
