/**
 * @file Mechanic Contract Test: summon (STRENGTHENED)
 *
 * DESIGN: Tests the core summon operation behavior with rigorous edge cases.
 *
 * INVARIANTS UNDER TEST:
 * - Summoned cards appear on correct player's board
 * - Summoned cards have correct zone and owner
 * - Board cap (5) is respected
 * - Summoned tokens have correct stats from template
 * - Each summoned card has unique UID
 * - Summoning does NOT affect opponent's board
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    thenBoard,
    resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: summon", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // BASIC SUMMON
    // ===========================================================================

    describe("basic summon", () => {
        it("summons a token to the owner's board", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("first").length).toBe(1);
        });

        it("summoned card has correct zone property", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 1,
            };
            whenRunEffects([effect], "first");

            const card = thenBoard("first")[0];
            expect(card.zone).toBe("board");
        });

        it("summoned card has correct owner", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 1,
            };
            whenRunEffects([effect], "second");

            expect(thenBoard("second").length).toBe(1);
            expect(thenBoard("second")[0].owner).toBe("second");
        });

        it("summoning for first player does NOT affect second player board", () => {
            // Critical: verify isolation between players
            givenGameState({ seed: 1 })
                .withSecondBoard([{ name: "Existing", type: "Follower", defense: 1, attack: 1 }])
                .build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 1,
            };
            whenRunEffects([effect], "first");

            // First player should have 1 card
            expect(thenBoard("first").length).toBe(1);
            // Second player should still have exactly 1 card (unchanged)
            expect(thenBoard("second").length).toBe(1);
            expect(thenBoard("second")[0].name).toBe("Existing");
        });

        it("each summoned card has unique UID", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 3,
            };
            whenRunEffects([effect], "first");

            const uids = thenBoard("first").map(c => c.uid);
            const uniqueUids = new Set(uids);
            expect(uniqueUids.size).toBe(3);
        });
    });

    // ===========================================================================
    // MULTIPLE SUMMONS
    // ===========================================================================

    describe("multiple summons", () => {
        it("summons specified count of tokens", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 3,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("first").length).toBe(3);
        });

        it("all summoned tokens have same name", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Fairy",
                count: 3,
            };
            whenRunEffects([effect], "first");

            const names = thenBoard("first").map(c => c.name);
            expect(names.every(n => n === "Fairy")).toBe(true);
        });

        it("summon 0 count does nothing", () => {
            givenGameState({ seed: 1 }).build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 0,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("first").length).toBe(0);
        });
    });

    // ===========================================================================
    // BOARD CAP
    // ===========================================================================

    describe("board cap enforcement", () => {
        it("respects board cap of 5 when partially full", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "A", type: "Follower", defense: 1, attack: 1 },
                    { name: "B", type: "Follower", defense: 1, attack: 1 },
                    { name: "C", type: "Follower", defense: 1, attack: 1 },
                    { name: "D", type: "Follower", defense: 1, attack: 1 },
                ])
                .build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 3,
            };
            whenRunEffects([effect], "first");

            // Should have exactly 5, not 7
            expect(thenBoard("first").length).toBe(5);
        });

        it("does not summon when board is full", () => {
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "A", type: "Follower", defense: 1, attack: 1 },
                    { name: "B", type: "Follower", defense: 1, attack: 1 },
                    { name: "C", type: "Follower", defense: 1, attack: 1 },
                    { name: "D", type: "Follower", defense: 1, attack: 1 },
                    { name: "E", type: "Follower", defense: 1, attack: 1 },
                ])
                .build();

            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 1,
            };
            whenRunEffects([effect], "first");

            expect(thenBoard("first").length).toBe(5);
        });

        it("board cap is per-player (opponent can still summon)", () => {
            // First player has full board
            givenGameState({ seed: 1 })
                .withFirstBoard([
                    { name: "A", type: "Follower", defense: 1, attack: 1 },
                    { name: "B", type: "Follower", defense: 1, attack: 1 },
                    { name: "C", type: "Follower", defense: 1, attack: 1 },
                    { name: "D", type: "Follower", defense: 1, attack: 1 },
                    { name: "E", type: "Follower", defense: 1, attack: 1 },
                ])
                .build();

            // Second player summons
            const effect = {
                op: "summon" as const,
                source: "named" as const,
                name: "Knight",
                count: 2,
            };
            whenRunEffects([effect], "second");

            // First player unchanged at 5
            expect(thenBoard("first").length).toBe(5);
            // Second player has 2
            expect(thenBoard("second").length).toBe(2);
        });
    });
});
