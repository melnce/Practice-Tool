
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../../src/core/gameState.js';
import { handleDamageSplitFixed } from '../../src/logic/effects/ops/damage.js';
import { spellboostHand } from '../../src/logic/effects/ops/spellboost.js';
import { makeUid } from '../../src/core/rng.js';

describe('Flames of Chaos Logic', () => {
    beforeEach(() => {
        state.blueHand = [];
        state.redBoard = [];
        state.blueDeck = [];
        state.redDeck = [];
    });

    it('should split spellboost damage across enemies', () => {
        // Mock Flames of Chaos
        const chaosCard = {
            uid: makeUid(),
            name: "Flames of Chaos",
            type: "Spell",
            keywords: ["Spellboost"],
            spellboostCount: 0,
            spell: [
                {
                    op: "damage_split_fixed",
                    target: "enemy:follower",
                    amount: "{self.spellboostCount}"
                }
            ]
        };

        state.blueHand = [chaosCard as any];

        // 1. Spellboost it 5 times
        spellboostHand("blue", 5);
        expect(chaosCard.spellboostCount).toBe(5);

        // 2. Setup targets: 3 followers with 2, 2, 2 HP
        const enemy1 = { uid: makeUid(), name: "E1", type: "Follower", defense: 2, max_defense: 2 };
        const enemy2 = { uid: makeUid(), name: "E2", type: "Follower", defense: 2, max_defense: 2 };
        const enemy3 = { uid: makeUid(), name: "E3", type: "Follower", defense: 2, max_defense: 2 };
        state.redBoard = [enemy1 as any, enemy2 as any, enemy3 as any];

        // 3. Invoke effect
        // NOTE: handleDamageSplitFixed expects the effect object. 
        // We simulate the call from index.ts
        const effect = chaosCard.spell[0];
        handleDamageSplitFixed(effect as any, "blue", chaosCard as any);

        // Logic check:
        // Total damage 5.
        // E1 takes 2 (dead), remaining 3.
        // E2 takes 2 (dead), remaining 1.
        // E3 takes 1 (alive), remaining 0.

        expect(enemy1.defense).toBe(0);
        expect(enemy2.defense).toBe(0);
        expect(enemy3.defense).toBe(1);
    });
});


