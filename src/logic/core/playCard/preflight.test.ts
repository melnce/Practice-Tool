// src/logic/core/playCard/preflight.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { canPlayCard } from "./preflight.js";
import { playCardNoRender } from "./index.js";
import { state, resetGameState } from "../../../core/gameState.js";
import { CardInstance } from "../../../core/types.js";

describe("Preflight System", () => {
    beforeEach(() => {
        resetGameState();
        state.isBlueTurn = true;
        state.bluePP = 10;
        state.blueMaxPP = 10;
    });

    describe("Spell with required target", () => {
        it("blocks when no enemy follower exists for targeted spell", () => {
            // Stormy Blast style spell: targets enemy:follower with select
            const spell: CardInstance = {
                id: "test-targeted-spell",
                uid: "spell-1",
                name: "Test Targeted Spell",
                type: "Spell",
                cost: 1,
                spell: [{
                    op: "damage",
                    target: "enemy:follower",
                    select: 1,
                    amount: 5
                }]
            };

            state.blueHand = [spell];
            state.redBoard = []; // No enemy followers

            const result = canPlayCard(spell, "blue");
            expect(result.ok).toBe(false);
            expect("reason" in result ? result.reason : "").toContain("target");

            // Verify PP unchanged
            expect(state.bluePP).toBe(10);
        });

        it("allows when enemy follower exists", () => {
            const spell: CardInstance = {
                id: "test-targeted-spell",
                uid: "spell-1",
                name: "Test Targeted Spell",
                type: "Spell",
                cost: 1,
                spell: [{
                    op: "damage",
                    target: "enemy:follower",
                    select: 1,
                    amount: 5
                }]
            };

            const enemyFollower: CardInstance = {
                id: "enemy-1",
                uid: "enemy-f-1",
                name: "Enemy Follower",
                type: "Follower",
                cost: 2,
                attack: 2,
                defense: 2
            };

            state.blueHand = [spell];
            state.redBoard = [enemyFollower];

            const result = canPlayCard(spell, "blue");
            expect(result.ok).toBe(true);
        });
    });

    describe("Radiant Rainbow (spellboost target requirement)", () => {
        it("blocks when no spellboost card in hand", () => {
            const radiantRainbow: CardInstance = {
                id: "10131310", // Actual ID
                uid: "rr-1",
                name: "Radiant Rainbow",
                type: "Spell",
                cost: 2,
                spell: [{
                    op: "select",
                    target: "ally:hand",
                    condition: { has_keyword: "Spellboost" },
                    select_count: 1,
                    effects: [
                        { op: "spellboost_target", times: 1 },
                        { op: "draw", count: 1 }
                    ]
                }]
            };

            // Only the spell itself in hand, no spellboost cards
            state.blueHand = [radiantRainbow];

            const result = canPlayCard(radiantRainbow, "blue");
            expect(result.ok).toBe(false);
            expect("reason" in result ? result.reason : "").toContain("Spellboost");
        });

        it("allows when spellboost card exists in hand", () => {
            const radiantRainbow: CardInstance = {
                id: "10131310",
                uid: "rr-1",
                name: "Radiant Rainbow",
                type: "Spell",
                cost: 2,
                spell: [{
                    op: "select",
                    target: "ally:hand",
                    condition: { has_keyword: "Spellboost" },
                    select_count: 1,
                    effects: [
                        { op: "spellboost_target", times: 1 },
                        { op: "draw", count: 1 }
                    ]
                }]
            };

            const spellboostCard: CardInstance = {
                id: "sb-card",
                uid: "sb-1",
                name: "Spellboost Card",
                type: "Follower",
                cost: 3,
                attack: 2,
                defense: 2,
                keywords: [{ name: "Spellboost", effects: [] }]
            };

            state.blueHand = [radiantRainbow, spellboostCard];

            const result = canPlayCard(radiantRainbow, "blue");
            expect(result.ok).toBe(true);
        });
    });

    describe("Board full check", () => {
        it("blocks permanent when board is full", () => {
            const follower: CardInstance = {
                id: "f-1",
                uid: "f-uid-1",
                name: "Test Follower",
                type: "Follower",
                cost: 1,
                attack: 1,
                defense: 1
            };

            // Fill board with 5 followers
            state.blueBoard = Array(5).fill(null).map((_, i) => ({
                id: `board-${i}`,
                uid: `board-uid-${i}`,
                name: `Board Follower ${i}`,
                type: "Follower",
                cost: 1,
                attack: 1,
                defense: 1
            }));

            state.blueHand = [follower];

            const result = canPlayCard(follower, "blue");
            expect(result.ok).toBe(false);
            expect("reason" in result ? result.reason : "").toContain("full");
        });
    });

    describe("cant_play flag", () => {
        it("blocks card with cant_play flag", () => {
            const card: CardInstance = {
                id: "blocked-card",
                uid: "bc-1",
                name: "Blocked Card",
                type: "Spell",
                cost: 1,
                cant_play: true
            };

            state.blueHand = [card];

            const result = canPlayCard(card, "blue");
            expect(result.ok).toBe(false);
            expect("reason" in result ? result.reason : "").toContain("cannot be played");
        });
    });

    describe("Mutation guarantees", () => {
        it("blocked outcome leaves state unchanged", () => {
            // Setup: spell that needs target but none available
            const spell: CardInstance = {
                id: "test-spell",
                uid: "spell-1",
                name: "Test Spell",
                type: "Spell",
                cost: 1,
                spell: [{
                    op: "damage",
                    target: "enemy:follower",
                    select: 1,
                    amount: 5
                }]
            };

            state.blueHand = [spell];
            state.bluePP = 5;
            state.redBoard = []; // No targets
            const handLengthBefore = state.blueHand.length;
            const ppBefore = state.bluePP;

            const result = canPlayCard(spell, "blue");

            // Preflight should block, state unchanged
            expect(result.ok).toBe(false);
            expect(state.blueHand.length).toBe(handLengthBefore);
            expect(state.bluePP).toBe(ppBefore);
        });

        it("done outcome mutates state correctly", () => {
            // Import playCardNoRender for this test

            // Setup: simple follower with no targeting
            const follower: CardInstance = {
                id: "test-follower",
                uid: "follower-1",
                name: "Test Follower",
                type: "Follower",
                cost: 2,
                attack: 3,
                defense: 3
            };

            state.blueHand = [follower];
            state.bluePP = 5;
            state.blueBoard = [];
            state.isBlueTurn = true;

            const ppBefore = state.bluePP;
            const handLengthBefore = state.blueHand.length;
            const boardLengthBefore = state.blueBoard.length;

            const result = playCardNoRender(state.blueHand, "blue", 0);

            expect(result.kind).toBe("done");
            expect(state.bluePP).toBe(ppBefore - 2); // Cost paid
            expect(state.blueHand.length).toBe(handLengthBefore - 1); // Removed from hand
            expect(state.blueBoard.length).toBe(boardLengthBefore + 1); // Added to board
        });
    });
});
