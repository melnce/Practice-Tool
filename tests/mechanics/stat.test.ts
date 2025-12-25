/**
 * @file Mechanic Contract Test: stat (STRENGTHENED)
 *
 * DESIGN: Tests the core stat operation with rigorous edge cases.
 *
 * INVARIANTS UNDER TEST:
 * - Attack/defense values change by exact amount
 * - Set overrides existing values completely
 * - Negative buffs work (debuff)
 * - Stat changes target correct player
 * - Multiple followers all receive buffs
 */

import { describe, it, expect, beforeEach } from "vitest";
import "../fixtures/setup.js";
import {
    givenGameState,
    whenRunEffects,
    findOnBoard,
    thenBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: stat", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // GIVE STATS (BUFF)
    // ===========================================================================

    describe("give action", () => {
        it("increases attack by specified amount", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 2, defense: 3 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "ally:follower",
                attack: 3,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.attack).toBe(5);
        });

        it("increases defense by specified amount", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 2, defense: 3 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "ally:follower",
                defense: 2,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.defense).toBe(5);
        });

        it("gives both attack and defense", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "ally:follower",
                attack: 2,
                defense: 3,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.attack).toBe(3);
            expect(target!.defense).toBe(4);
        });

        it("buffs ALL ally followers, not just one", () => {
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
                defense: 1,
            };
            whenRunEffects([effect], "first");

            // All should be buffed
            expect(findOnBoard("first", "A")!.attack).toBe(2);
            expect(findOnBoard("first", "B")!.attack).toBe(3);
            expect(findOnBoard("first", "C")!.attack).toBe(4);
        });

        it("does NOT buff enemy followers when target is ally:follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Ally", type: "Follower", attack: 1, defense: 1 }])
                .withSecondBoard([{ name: "Enemy", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "ally:follower",
                attack: 5,
            };
            whenRunEffects([effect], "first");

            // Ally buffed
            expect(findOnBoard("first", "Ally")!.attack).toBe(6);
            // Enemy untouched
            expect(findOnBoard("second", "Enemy")!.attack).toBe(1);
        });

        it("CAN buff enemy followers when target is enemy:follower", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Ally", type: "Follower", attack: 1, defense: 1 }])
                .withSecondBoard([{ name: "Enemy", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "enemy:follower",
                attack: 3,
            };
            whenRunEffects([effect], "first");

            // Ally untouched
            expect(findOnBoard("first", "Ally")!.attack).toBe(1);
            // Enemy buffed
            expect(findOnBoard("second", "Enemy")!.attack).toBe(4);
        });

        it("negative buff reduces stats (debuff)", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Target", type: "Follower", attack: 5, defense: 5 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "enemy:follower",
                attack: -2,
                defense: -3,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("second", "Target");
            expect(target!.attack).toBe(3);
            expect(target!.defense).toBe(2);
        });
    });

    // ===========================================================================
    // SET STATS (OVERRIDE)
    // ===========================================================================

    describe("set action", () => {
        it("overrides attack to specified value", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 5, defense: 3 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "set",
                target: "ally:follower",
                attack: 1,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.attack).toBe(1);
        });

        it("overrides defense to specified value", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 2, defense: 5 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "set",
                target: "ally:follower",
                defense: 1,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.defense).toBe(1);
        });

        it("set to 0 works", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 5, defense: 5 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "set",
                target: "ally:follower",
                attack: 0,
            };
            whenRunEffects([effect], "first");

            const target = findOnBoard("first", "Target");
            expect(target!.attack).toBe(0);
        });
    });

    // ===========================================================================
    // SELF TARGETING
    // ===========================================================================

    describe("self targeting", () => {
        it("buffs source card when target is self", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Source", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const sourceCard = findOnBoard("first", "Source");

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "self",
                attack: 3,
                defense: 3,
            };
            whenRunEffects([effect], "first", sourceCard);

            const updated = findOnBoard("first", "Source");
            expect(updated!.attack).toBe(5);
            expect(updated!.defense).toBe(5);
        });

        it("self targeting with no source card does nothing", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Bystander", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "self",
                attack: 10,
            };
            // No source card provided
            whenRunEffects([effect], "first", null);

            // Bystander should be unchanged
            expect(findOnBoard("first", "Bystander")!.attack).toBe(1);
        });
    });
});
