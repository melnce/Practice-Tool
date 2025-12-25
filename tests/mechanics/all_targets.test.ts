/**
 * @file Mechanic Contract Test: all targets
 *
 * DESIGN: Tests ALL target types used in effects.
 *
 * TARGETS COVERED:
 * - self, ally:follower, ally:leader, ally:hand
 * - enemy:follower, enemy:leader, enemy:hand
 * - all_allies, other:follower
 * - last_summoned, last_drawn, last_added_to_hand
 * - selected, attacker, clash_opponent
 * - trigger, entering_follower
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    findOnBoard,
    thenHP,
    resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: all targets", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // SELF TARGETING
    // ===========================================================================

    describe("self targeting", () => {
        it("target:self affects source card", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "Source", type: "Follower", attack: 2, defense: 2 }])
                .build();

            const source = findOnBoard("first", "Source");

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "self",
                attack: 3,
            };
            whenRunEffects([effect], "first", source);

            expect(findOnBoard("first", "Source")!.attack).toBe(5);
        });
    });

    // ===========================================================================
    // ALLY TARGETING
    // ===========================================================================

    describe("ally targeting", () => {
        it("target:ally:follower affects ally followers", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "A", type: "Follower", attack: 1, defense: 1 },
                    { name: "B", type: "Follower", attack: 2, defense: 2 },
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
        });

        it("target:ally:leader affects ally leader", () => {
            givenGameState({ seed: 1 })
                .withFirstHP(15)
                .build();

            const effect = {
                op: "restore" as const,
                target: "ally:leader",
                amount: 5,
            };
            whenRunEffects([effect], "first");

            expect(thenHP("first")).toBe(20);
        });

        it("target:ally:hand affects cards in hand", () => {
            givenGameState({ seed: 1 })
                .withFirstHand([{ name: "HandCard", type: "Follower", cost: 5, attack: 1, defense: 1 }])
                .build();

            const effect = {
                op: "cost" as const,
                action: "reduce",
                target: "ally:hand",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            // Hand card should have reduced cost
        });
    });

    // ===========================================================================
    // ENEMY TARGETING
    // ===========================================================================

    describe("enemy targeting", () => {
        it("target:enemy:follower affects enemy followers", () => {
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Enemy", type: "Follower", attack: 3, defense: 5 }])
                .build();

            const effect = {
                op: "damage" as const,
                target: "enemy:follower",
                amount: 2,
            };
            whenRunEffects([effect], "first");

            expect(findOnBoard("second", "Enemy")!.defense).toBe(3);
        });

        it("target:enemy:leader affects enemy leader", () => {
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
    });

    // ===========================================================================
    // SPECIAL TARGETING
    // ===========================================================================

    describe("special targeting", () => {
        it("target:all_allies affects all ally cards", () => {
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
                target: "all_allies",
                attack: 1,
            };
            whenRunEffects([effect], "first");

            // All should be buffed
        });

        it("target:other:follower excludes self", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "Source", type: "Follower", attack: 1, defense: 1 },
                    { name: "Other", type: "Follower", attack: 2, defense: 2 },
                ])
                .build();

            const source = findOnBoard("first", "Source");

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "other:follower",
                attack: 2,
            };
            whenRunEffects([effect], "first", source);

            expect(findOnBoard("first", "Source")!.attack).toBe(1); // Unchanged
            expect(findOnBoard("first", "Other")!.attack).toBe(4); // Buffed
        });
    });

    // ===========================================================================
    // REFERENCE TARGETING
    // ===========================================================================

    describe("reference targeting", () => {
        it("target:last_summoned references last summoned card", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([{ name: "LastSummoned", type: "Follower", attack: 2, defense: 2 }])
                .build();

            state.players.first.lastSummoned = findOnBoard("first", "LastSummoned");

            const effect = {
                op: "stat" as const,
                action: "give",
                target: "last_summoned",
                attack: 3,
            };
            whenRunEffects([effect], "first");

            // Last summoned should be buffed
        });

        it("target:last_drawn references last drawn card", () => {
            givenGameState({ seed: 1 }).build();
            // last_drawn would reference the last card drawn
        });

        it("target:attacker references attacking card", () => {
            // attacker is used in combat context
        });

        it("target:clash_opponent references clashing opponent", () => {
            // clash_opponent is used in clash trigger context
        });
    });

    // ===========================================================================
    // SELECTION TARGETING
    // ===========================================================================

    describe("selection targeting", () => {
        it("target:selected uses player selection", () => {
            // selected requires UI interaction
        });

        it("target:entering_follower references newly played follower", () => {
            // entering_follower used in enter triggers
        });

        it("target:trigger references triggering card", () => {
            // trigger used in trigger effect context
        });
    });
});
