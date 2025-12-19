/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/integration/juno.test.ts
 * Reason: TypeError: makeUid is not a function
 * Classification: BROKEN: harness/infra rot
 * 
 * POLICY: Do not fix by changing engine code.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../../src/core/gameState.js';
import { handleDamage } from '../../src/logic/effects/ops/damage.js';
import { makeUid } from '../../src/core/rng.js';

describe('Juno Earth Counter Damage Logic', () => {
    beforeEach(() => {
        state.blueBoard = [];
        state.redBoard = [];
        state.blueHand = [];
        state.redHand = [];
    });

    it('should calculate damage based on earth counter sum', () => {
        // Setup: Create amulets with earth counters
        const sigil1 = {
            uid: makeUid(),
            name: "Earth Sigil 1",
            type: "Amulet",
            counters: { earth: 2 }
        };
        const sigil2 = {
            uid: makeUid(),
            name: "Earth Sigil 2",
            type: "Amulet",
            counters: { earth: 3 }
        };
        state.blueBoard = [sigil1 as any, sigil2 as any];

        // Setup: Enemy follower
        const enemy = {
            uid: makeUid(),
            name: "Target",
            type: "Follower",
            defense: 10,
            max_defense: 10
        };
        state.redBoard = [enemy as any];

        // Mock Juno fanfare effect
        const effect = {
            op: "damage",
            target: "enemy:follower",
            select: 1,
            amount: "{earth_counter_sum}"
        };

        // Simulate damage (with target pre-selected)
        const context = { targets: [enemy] };
        handleDamage(effect as any, "blue", null as any, [], context);

        // Expected: 2 + 3 = 5 damage
        // Remaining: 10 - 5 = 5
        expect(enemy.defense).toBe(5);
    });

    it('should return 0 if no earth counters exist', () => {
        // No amulets with earth counters
        state.blueBoard = [];

        const enemy = {
            uid: makeUid(),
            name: "Target",
            type: "Follower",
            defense: 10,
            max_defense: 10
        };
        state.redBoard = [enemy as any];

        const effect = {
            op: "damage",
            target: "enemy:follower",
            select: 1,
            amount: "{earth_counter_sum}"
        };

        const context = { targets: [enemy] };
        handleDamage(effect as any, "blue", null as any, [], context);

        // No damage should be dealt (0 earth counters)
        expect(enemy.defense).toBe(10);
    });
});


