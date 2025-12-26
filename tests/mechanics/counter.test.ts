/**
 * @file Mechanic Contract Test: counter mechanics
 *
 * DESIGN: Tests counter operations
 * - counter op: for card-level counters (earth, faith) and game-state counters (combo)
 * - add_shadows op: for player-level shadows counter
 * 
 * NOTE: Rally is NOT modified via effect ops - it's automatically incremented
 * when followers enter play. Crest counters use the crest op.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
    givenGameState,
    whenRunEffects,
    resetUidCounter,
    thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import type { CardInstance } from "../../src/core/types/index.js";

describe("Mechanic Contract: counters", () => {
    beforeEach(() => {
        resetUidCounter();
    });

    // ===========================================================================
    // ADD_SHADOWS (player-level, uses add_shadows op)
    // Canonical: { op: "add_shadows", amount: N }
    // ===========================================================================

    describe("add_shadows op", () => {
        it("add_shadows increases shadow count", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 5;

            const effect = {
                op: "add_shadows" as const,
                amount: 3,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.shadows).toBe(8);
        });

        it("shadows are per-player", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.shadows = 10;
            state.players.second.shadows = 5;

            const effect = {
                op: "add_shadows" as const,
                amount: 3,
            };
            whenRunEffects([effect], "first");

            // Only first player increases
            expect(state.players.first.shadows).toBe(13);
            expect(state.players.second.shadows).toBe(5);
        });
    });

    // ===========================================================================
    // COUNTER OP - CARD-LEVEL
    // Canonical: { op: "counter", action: "add"|"spend"|"set", key: "earth"|"faith", amount: N }
    // ===========================================================================

    describe("counter op (card-level)", () => {
        it("adds counter to source card", () => {
            givenGameState({ seed: 1 }).build();

            // Create a source card with counter capability
            const sourceCard: CardInstance = {
                uid: "test-1",
                name: "Magic Sediment",
                type: "Amulet",
                owner: "first",
                zone: "board",
                counters: { earth: 0 },
            } as CardInstance;
            state.players.first.board.push(sourceCard);

            const effect = {
                op: "counter" as const,
                action: "add",
                key: "earth",
                amount: 1,
            };
            // Note: counter op on card requires sourceCard parameter
            whenRunEffects([effect], "first", sourceCard);

            expect(sourceCard.counters?.earth).toBe(1);
        });

        it("spends counter from source card", () => {
            givenGameState({ seed: 1 }).build();

            const sourceCard: CardInstance = {
                uid: "test-1",
                name: "Magic Sediment",
                type: "Amulet",
                owner: "first",
                zone: "board",
                counters: { earth: 3 },
            } as CardInstance;
            state.players.first.board.push(sourceCard);

            const effect = {
                op: "counter" as const,
                action: "spend",
                key: "earth",
                amount: 1,
            };
            whenRunEffects([effect], "first", sourceCard);

            expect(sourceCard.counters?.earth).toBe(2);
        });
    });

    // ===========================================================================
    // COMBO COUNTER (game-state via counter op)
    // Canonical: { op: "counter", action: "add", key: "combo", amount: N }
    // ===========================================================================

    describe("counter op (combo)", () => {
        it("add combo increments playsThisTurn", () => {
            givenGameState({ seed: 1 }).build();
            state.players.first.playsThisTurn = 2;

            const effect = {
                op: "counter" as const,
                action: "add",
                key: "combo",
                amount: 1,
            };
            whenRunEffects([effect], "first");

            expect(state.players.first.playsThisTurn).toBe(3);
        });
    });

    // ===========================================================================
    // EDGE CASES
    // ===========================================================================

    describe("edge cases", () => {
        it("spend counter cannot go below 0", () => {
            givenGameState({ seed: 1 }).build();

            const sourceCard: CardInstance = {
                uid: "test-1",
                name: "Magic Sediment",
                type: "Amulet",
                owner: "first",
                zone: "board",
                counters: { earth: 1 },
            } as CardInstance;
            state.players.first.board.push(sourceCard);

            const effect = {
                op: "counter" as const,
                action: "spend",
                key: "earth",
                amount: 5,
            };
            whenRunEffects([effect], "first", sourceCard);

            expect(sourceCard.counters?.earth).toBeGreaterThanOrEqual(0);
        });
    });
});
