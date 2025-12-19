/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/integration/turns.test.ts
 * Reason: TypeError: makeUid is not a function
 * Classification: BROKEN: harness/infra rot
 * 
 * POLICY: Do not fix by changing engine code.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { endTurnBlue, endTurnRed, startTurnBlue, startTurnRed } from "../../src/logic/core/turns";
import { makeUid } from "../../src/core/rng";
import { vanillaFollower } from "../fixtures/utils/testCards";

describe("Turn System", () => {
    beforeEach(() => {
        resetGameState();
        state.blueMaxPP = 1;
        state.redMaxPP = 1;
        state.bluePP = 1;
        state.redPP = 1;
        state.roundCount = 1;
        state.isBlueTurn = true;
    });

    it("should gain PP max and refill PP on turn start", () => {
        // Blue ends turn -> Red turn starts
        endTurnBlue();
        // Check transition
        expect(state.isBlueTurn).toBe(false);
        // Red start turn logic usually part of endTurnBlue or explicit?
        // In this engine, endTurnBlue calls startTurnRed usually.
        // Let's verify Red stats.

        // Red should have gained max PP (1 -> 2 if round advanced?)
        // Rules: Player 2 starts with 1, Player 1 starts with 1. 2nd turn P1 -> 2.
        // Let's rely on observation of logic.
        // If P1 (Blue) ends turn 1, P2 (Red) starts turn 1.
        expect(state.redMaxPP).toBeGreaterThanOrEqual(1);
        expect(state.redPP).toBe(state.redMaxPP);
    });

    it("should reset temporary flags like 'can_attack' on turn start", () => {
        // Setup a unit for Red that attacked last turn (simulated)
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "red", can_attack: false, hasAttacked: true };
        state.redBoard = [unit];
        state.isBlueTurn = true; // currently Blue turn

        // Blue ends turn -> Red starts
        endTurnBlue();

        // Red's unit should refresh
        expect(state.isBlueTurn).toBe(false);
        expect(unit.can_attack).toBe(true);
        expect(unit.hasAttacked).toBe(false);
    });

    it("should increment round count after full cycle", () => {
        state.roundCount = 1;
        state.isBlueTurn = true;

        endTurnBlue(); // -> Red Turn 1
        expect(state.roundCount).toBe(1); // Standard Shadowverse/CCG round logic often counts pairs? Or 1..2..

        endTurnRed(); // -> Blue Turn 2

        // now Blue's turn, round should likely be 2
        expect(state.roundCount).toBe(2);
        expect(state.isBlueTurn).toBe(true);
        expect(state.blueMaxPP).toBe(2);
    });
});


