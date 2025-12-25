/**
 * @file Mechanic Contract Test: damage (STRENGTHENED)
 *
 * DESIGN: Tests the core damage operation behavior across all variants.
 * Rigorous edge cases to reveal bugs.
 *
 * INVARIANTS UNDER TEST:
 * - Damage reduces defense by exact amount
 * - Follower with 0 or less defense is destroyed
 * - Leader damage reduces HP
 * - RNG is deterministic with seed
 * - Damage to zero does nothing
 * - Correct player receives damage (not the caster)
 */

import { describe, it, expect, beforeEach } from "vitest";
import "../fixtures/setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    thenHP,
    findOnBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: damage", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC DAMAGE TO FOLLOWER
    // ===========================================================================

    describe("basic follower damage", () => {
        it("reduces defense by exact amount (direct)", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", defense: 5, attack: 1 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 3,
                distribution: "direct" as const,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            expect(target).toBeDefined();
            expect(target!.defense).toBe(2);
        });

        it("destroys follower when defense reaches 0", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", defense: 3, attack: 1 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 3,
                distribution: "direct" as const,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("second").length).toBe(0);
        });

        it("destroys follower when damage exceeds defense", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", defense: 2, attack: 1 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 5,
                distribution: "direct" as const,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("second").length).toBe(0);
        });

        it("0 damage does NOT destroy follower", () => {
            // Edge case: 0 damage should be a no-op
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", defense: 3, attack: 1 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 0,
                distribution: "direct" as const,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            expect(target).toBeDefined();
            expect(target!.defense).toBe(3);
        });

        it("damages ONLY enemy follower, not ally", () => {
            // Critical: verify targeting is correct
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Ally", type: "Follower", defense: 5, attack: 1 }])
                .withSecondBoard([{ name: "Enemy", type: "Follower", defense: 5, attack: 1 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 3,
                distribution: "direct" as const,
            };
            whenRunEffects([effect], "first");

            // Ally should be untouched
            expect(findOnBoard("first", "Ally")!.defense).toBe(5);
            // Enemy should be damaged
            expect(findOnBoard("second", "Enemy")!.defense).toBe(2);
        });

        it("damages ally follower when target is ally:follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Ally", type: "Follower", defense: 5, attack: 1 }])
                .withSecondBoard([{ name: "Enemy", type: "Follower", defense: 5, attack: 1 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "ally:follower",
                amount: 2,
                distribution: "direct" as const,
            };
            whenRunEffects([effect], "first");

            // Ally should be damaged
            expect(findOnBoard("first", "Ally")!.defense).toBe(3);
            // Enemy should be untouched
            expect(findOnBoard("second", "Enemy")!.defense).toBe(5);
        });
    });

    // ===========================================================================
    // LEADER DAMAGE
    // ===========================================================================

    describe("leader damage", () => {
        it("reduces leader HP by exact amount", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:leader",
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(15);
        });

        it("allows HP to go negative (for game-over detection)", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(3)
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:leader",
                amount: 10,
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBeLessThanOrEqual(0);
        });

        it("damages ENEMY leader, not ally leader", () => {
            // Critical: caster should not damage themselves
            givenGameState({ seed: 1 })
                .withFirstHP(20)
                .withSecondHP(20)
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:leader",
                amount: 7,
            };
            whenRunEffects([effect], "first");

            // First player (caster) should be untouched
            expect(thenHP("first")).toBe(20);
            // Second player (enemy) should be damaged
            expect(thenHP("second")).toBe(13);
        });

        it("damages ally leader when target is ally:leader", () => {
            givenGameState({ seed: 1 })
                .withFirstHP(20)
                .withSecondHP(20)
                .build();

            const effect = {
                op: "damage" as const,
                target: "ally:leader",
                amount: 5,
            };
            whenRunEffects([effect], "first");

            // First player should be damaged
            expect(thenHP("first")).toBe(15);
            // Second player should be untouched
            expect(thenHP("second")).toBe(20);
        });
    });

    // ===========================================================================
    // RANDOM HITS (DETERMINISTIC)
    // ===========================================================================

    describe("random_hits distribution", () => {
        it("same seed produces same random target", () => {
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

                const effect = {
                    op: "damage" as const,
                    target: "enemy:follower",
                    amount: 3,
                    distribution: "random_hits" as const,
                    count: 1,
                };
                whenRunEffects([effect], "first");

                const damaged = thenBoard("second").find((c) => c.defense === 2);
                results.push(damaged?.name ?? "none");
            }

            expect(results[0]).toBe(results[1]);
        });

        it("deals multiple random hits totaling correct damage", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "A", type: "Follower", defense: 10, attack: 1 },
                    { name: "B", type: "Follower", defense: 10, attack: 1 },
                ])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 1,
                distribution: "random_hits" as const,
                count: 5,
            };
            whenRunEffects([effect], "first");

            // Total damage dealt should be exactly 5
            const totalDefense = thenBoard("second").reduce((sum, c) => sum + (c.defense as number), 0);
            expect(totalDefense).toBe(15); // 20 - 5
        });

        it("random hits can kill followers during distribution", () => {
            // If a follower dies mid-hits, remaining hits go to survivors
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "Weak", type: "Follower", defense: 2, attack: 1 },
                    { name: "Strong", type: "Follower", defense: 10, attack: 1 },
                ])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 1,
                distribution: "random_hits" as const,
                count: 10,
            };
            whenRunEffects([effect], "first");

            // Total damage should be 10, distributed across both (one may die)
            const remainingBoard = thenBoard("second");
            const totalRemaining = remainingBoard.reduce((sum, c) => sum + (c.defense as number), 0);
            // Either both alive (12 - 10 = 2) or one dead (10 - remaining hits)
            expect(totalRemaining).toBeLessThanOrEqual(2);
        });
    });

    // ===========================================================================
    // SPLIT SEQUENTIAL
    // ===========================================================================

    describe("split_sequential distribution", () => {
        it("kills first target then spills to next", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "First", type: "Follower", defense: 2, attack: 1 },
                    { name: "Second", type: "Follower", defense: 5, attack: 1 },
                ])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 4,
                distribution: "split_sequential" as const,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("second").length).toBe(1);
            expect(findOnBoard("second", "Second")?.defense).toBe(3);
        });

        it("kills multiple targets if damage is sufficient", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([
                    { name: "First", type: "Follower", defense: 2, attack: 1 },
                    { name: "Second", type: "Follower", defense: 2, attack: 1 },
                    { name: "Third", type: "Follower", defense: 5, attack: 1 },
                ])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 6,
                distribution: "split_sequential" as const,
            };
            whenRunEffects([effect], "first");

            // Should kill First (2), Second (2), and deal 2 to Third
            expect(thenBoard("second").length).toBe(1);
            expect(findOnBoard("second", "Third")?.defense).toBe(3);
        });
    });
});
