
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { state, resetGameState } from '../../../src/core/gameState';
import { CardInstance } from '../../../src/core/types';
import { dispatchAction } from '../../../src/logic/core/dispatch';
import { applyKeyword } from '../../../src/logic/core/keywords/apply';
import { loadCardDatabase } from '../../../src/data/cardDatabase';

// Mock adapter to prevent render calls
vi.mock('../../../src/core/adapter.js', () => ({
    adapter: {
        render: vi.fn(),
        subscribe: vi.fn(),
        state: {} // generic
    }
}));

const makeUid = () => "test_uid_" + Math.random().toString(36).slice(2);

describe('Bug: cant_attack keyword', () => {
    beforeAll(async () => {
        // Minimal DB load if needed, or mock
        // loadCardDatabase is async
    });

    beforeEach(() => {
        resetGameState();
        state.bluePP = 10;
        state.isBlueTurn = true;
    });

    it('should prevent attacking when cant_attack is applied via applyKeyword', () => {
        // 1. Setup Attacker
        const attacker: CardInstance = {
            id: "10101010", // generic
            uid: makeUid(),
            name: "Goliath",
            type: "Follower",
            cost: 4,
            attack: 3,
            defense: 4,
            owner: "blue",
            zone: "board",
            can_attack: true, // Should be true initially
            attacks_left: 1,
            turnPlayed: state.turn - 1
        };
        state.blueBoard = [attacker];

        // 2. Setup Defender
        const defender: CardInstance = {
            id: "20202020",
            uid: makeUid(),
            name: "Goblin",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 2,
            owner: "red",
            zone: "board"
        };
        state.redBoard = [defender];

        // 3. Apply "cant_attack"
        applyKeyword(attacker, "cant_attack");

        // 4. Verify Flags in KeywordState
        expect(attacker.keywordState).toBeDefined();
        // Check for specific flags set by apply.ts
        const ks = attacker.keywordState!;
        expect(ks.hasCantAttack || ks.cantAttack).toBeTruthy();

        // 5. Verify Attack Blocked IMMEDIATELY (Same turn)
        let blocked = false;
        try {
            dispatchAction(state, {
                type: 'ATTACK',
                player: 'blue',
                attackerUid: attacker.uid,
                defender: { type: 'card', uid: defender.uid }
            });
        } catch (e) {
            blocked = true;
        }

        // Attack should be blocked
        expect(state.redBoard[0].defense).toBe(2);

        // --- NEW: Test Expiration Logic ---
        // Case: "until_opponent_eot"
        // Let's reset and apply specifically with options
        resetGameState();
        state.bluePP = 10;
        state.isBlueTurn = true;

        // Setup again
        const att2 = { ...attacker, uid: makeUid(), keywordState: {} }; // fresh
        state.blueBoard = [att2];
        const def2 = { ...defender, uid: makeUid() };
        state.redBoard = [def2];

        // Apply with option
        applyKeyword(att2, "cant_attack", { until_opponent_eot: true });

        // Pass Turn to Red (Opponent)
        // We simulate turn passing manually or via dispatch?
        // dispatch END_TURN handles logic
        dispatchAction(state, { type: "END_TURN" } as any);

        // Now it is Red's turn. 
        // Attacker is Blue. 
        // Wait, Snowman Army is cast by Blue on RED follower usually (Enemy follower).
        // Let's allow Blue to cast on Red follower.

        resetGameState();
        state.isBlueTurn = true;

        // Blue is active. Red has a follower.
        const victim = { ...defender, uid: makeUid(), keywordState: {}, owner: "red" as any, can_attack: true, attacks_left: 1 };
        state.redBoard = [victim];

        // Blue applies debuff to Red follower
        applyKeyword(victim, "cant_attack", { until_opponent_eot: true });

        // Blue ends turn.
        dispatchAction(state, { type: "END_TURN" } as any); // -> becomes Red turn

        expect(state.isBlueTurn).toBe(false);

        // Red tries to attack with victim
        // Should FAIL because "Until Opponent (Red) EOT"

        try {
            dispatchAction(state, {
                type: 'ATTACK',
                player: 'red',
                attackerUid: victim.uid,
                defender: { type: 'leader', player: 'blue' } // Attack face or whatever
            });
        } catch (e) { }

        // Hack: Check if attack happened. 
        // If attack happened, Blue HP < 20.
        // Or check hasAttacked flag.
        expect(victim.hasAttacked).toBeFalsy();
        expect(state.blueHP).toBe(20);

        // Red Ends Turn
        dispatchAction(state, { type: "END_TURN" } as any);

        // Now Blue Turn. Debuff should be gone? 
        // "Until end of opponent's turn". 
        // If Blue cast it, Opponent is Red. 
        // Ends at Red EOT. 
        // Only effectively gone now.

        // Verify victim status (though it's not their turn)
        expect(victim.keywordState?.cantAttack).toBeFalsy();
    });
});
