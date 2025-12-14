
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../../src/core/gameState.js';
import { handleDamageAll } from '../../src/logic/effects/ops/damage.js';
import { handleSetSpellboostCount } from '../../src/logic/effects/ops/spellboost.js';
import { spellboostHand } from '../../src/logic/effects/ops/spellboost.js';
import { runEffects } from '../../src/logic/core/effects/index.js';
import { makeUid } from '../../src/core/rng.js';

describe('William Logic', () => {
    beforeEach(() => {
        state.blueHand = [];
        state.redBoard = [];
        state.blueDeck = [];
        state.redDeck = [];
    });

    it('should charge spellboost and reset after fanfare', () => {
        // Mock William
        const william = {
            uid: makeUid(),
            name: "William",
            type: "Follower",
            keywords: ["Spellboost"],
            spellboostCount: 0,
            fanfare: [
                {
                    op: "damage_all",
                    target: "enemy:follower",
                    amount: "{self.spellboostCount}"
                },
                {
                    op: "set_spellboost_count",
                    amount: 0
                }
            ]
        };

        state.blueHand = [william as any];

        // 1. Spellboost it 5 times
        spellboostHand("blue", 5);
        expect(william.spellboostCount).toBe(5);

        // 2. Setup targets
        const enemy1 = { uid: makeUid(), defense: 4, type: "Follower" };
        const enemy2 = { uid: makeUid(), defense: 6, type: "Follower" };
        state.redBoard = [enemy1 as any, enemy2 as any];

        // 3. Invoke Fanfare via runEffects (to test chain)
        runEffects(william.fanfare, "blue", william as any);

        // Logic check:
        // E1: 4 - 5 = -1 (dead)
        // E2: 6 - 5 = 1 (alive)
        expect(enemy1.defense).toBeLessThanOrEqual(0);
        expect(enemy2.defense).toBe(1);

        // Spellboost count should be reset
        expect(william.spellboostCount).toBe(0);
    });
});


