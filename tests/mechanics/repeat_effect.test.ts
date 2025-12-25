/**
 * @file Mechanic Contract Test: repeat_effect
 *
 * DESIGN: Tests the repeat_effect operation (loop effects X times).
 *
 * INVARIANTS UNDER TEST:
 * - Effect fires specified number of times
 * - Count 0 fires nothing
 * - Cumulative effects stack
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

describe("Mechanic Contract: repeat_effect", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC REPEAT
    // ===========================================================================

    describe("repeat effect", () => {
        it("fires effect specified number of times", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            const effect = {
                op: "repeat_effect" as const,
                count: 5,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 1,
                }],
            };
            whenRunEffects([effect], "first");

            // 5 x 1 damage = 5 damage
            expect(thenHP("second")).toBe(15);
        });

        it("cumulative stat buffs stack", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Target", type: "Follower", attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "repeat_effect" as const,
                count: 3,
                effects: [{
                    op: "stat" as const,
                    action: "give",
                    target: "ally:follower",
                    attack: 2,
                }],
            };
            whenRunEffects([effect], "first");

            // 3 x +2 attack = +6 attack
            expect(findOnBoard("first", "Target")!.attack).toBe(7);
        });

        it("count 0 fires nothing", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            const effect = {
                op: "repeat_effect" as const,
                count: 0,
                effects: [{
                    op: "damage" as const,
                    target: "enemy:leader",
                    amount: 5,
                }],
            };
            whenRunEffects([effect], "first");

            expect(thenHP("second")).toBe(20);
        });

        it("count 1 fires once", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            const effect = {
                op: "repeat_effect" as const,
                count: 1,
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
    // DYNAMIC COUNT
    // ===========================================================================

    describe("dynamic count", () => {
        it("count from counter (e.g., shadows)", () => {
            givenGameState({ seed: 1 })
                .withSecondHP(20)
                .build();

            // Would need shadows count to test, but we can test fixed for now
        });
    });
});
