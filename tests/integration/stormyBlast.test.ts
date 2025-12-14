
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../../src/core/gameState.js';
import { runEffects } from '../../src/logic/core/effects/index.js';
import { spellboostHand } from '../../src/logic/effects/ops/spellboost.js';
import { handleDamage } from '../../src/logic/effects/ops/damage.js';
import { makeUid } from '../../src/core/rng.js';

describe('Stormy Blast Damage Logic', () => {
    beforeEach(() => {
        state.blueHand = [];
        state.redBoard = [];
        state.blueDeck = [];
        state.redDeck = [];
    });

    it('should scale damage with spellboost count using add_amount', () => {
        // Mock Stormy Blast card
        const stormyBlast = {
            uid: makeUid(),
            name: "Stormy Blast",
            type: "Spell",
            keywords: ["Spellboost"],
            spellboostCount: 0,
            spell: [
                {
                    op: "damage",
                    target: "enemy:follower",
                    select: 1,
                    amount: 2,
                    add_amount: "{self.spellboostCount}"
                }
            ]
        };

        state.blueHand = [stormyBlast as any];

        // 1. Spellboost it 3 times
        spellboostHand("blue", 3);

        expect(stormyBlast.spellboostCount).toBe(3);

        // 2. Setup a target
        const enemy = {
            uid: makeUid(),
            name: "Target Dummy",
            type: "Follower",
            defense: 10,
            max_defense: 10,
            description: "Target"
        };
        state.redBoard = [enemy as any];

        // 3. Manually invoke the effect as if played
        // The effect definition is: { amount: 2, add_amount: "{self.spellboostCount}" }
        const effect = stormyBlast.spell[0];

        // We simulate the selection context
        const context = {
            targets: [enemy],
            sourceCard: stormyBlast
        };

        // We use handleDamage directly to test resolution logic
        handleDamage(effect as any, "blue", stormyBlast as any, [], context);

        // Expected Damage: Base 2 + Spellboost 3 = 5
        // Remaining Defense: 10 - 5 = 5
        expect(enemy.defense).toBe(5);
    });
});


