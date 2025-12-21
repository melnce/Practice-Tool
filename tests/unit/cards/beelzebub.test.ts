
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { state, resetGameState } from '../../../src/core/gameState.js';
import { applyLeaderDamage, handleModifyLeaderDamageReceived } from '../../../src/logic/effects/leader.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Card: Beelzebub, Supreme King', () => {
    beforeEach(() => {
        resetGameState();
    });

    describe('Core Logic: Leader Damage Bonus', () => {
        it('should correctly store the damage bonus in state', () => {
            handleModifyLeaderDamageReceived({ amount: 1 } as any, 'red');
            expect(state.redLeaderDamagePlus).toBe(1);
            expect(state.blueLeaderDamagePlus).toBe(0);

            handleModifyLeaderDamageReceived({ amount: 1 } as any, 'red');
            expect(state.redLeaderDamagePlus).toBe(2); // Stacking
        });

        it('should apply the bonus when taking damage', () => {
            state.redLeaderDamagePlus = 1;
            state.redHP = 20;

            // Damage 2 + 1 = 3
            applyLeaderDamage('red', 2);
            expect(state.redHP).toBe(17);

            // Peristent: Damage 1 + 1 = 2
            applyLeaderDamage('red', 1);
            expect(state.redHP).toBe(15);
        });

        it('should NOT apply bonus for 0 damage or healing', () => {
            state.redLeaderDamagePlus = 5;
            state.redHP = 20;

            applyLeaderDamage('red', 0);
            expect(state.redHP).toBe(20);

            applyLeaderDamage('red', -5);
            expect(state.redHP).toBe(20);
        });

        it('should respect resetGameState', () => {
            state.redLeaderDamagePlus = 5;
            resetGameState();
            expect(state.redLeaderDamagePlus).toBe(0);
        });
    });

    describe('Card Definition (JSON)', () => {
        it('should have correct Fanfare definition matching requirements', () => {
            const filePath = path.resolve(__dirname, '../../../cards/sets/10004_skybound-dragons.json');
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const card = content.find((c: any) => c.name === "Beelzebub, Supreme King");

            expect(card).toBeDefined();

            const fanfare = card.fanfare;
            expect(fanfare).toHaveLength(2);

            // 1. Select 2 enemies, silence, damage 9
            const selOp = fanfare[0];
            expect(selOp.op).toBe('select');
            expect(selOp.count).toBe(2);
            expect(selOp.target).toBe('enemy:follower');

            const subEffects = selOp.effects;
            expect(subEffects).toHaveLength(2);
            expect(subEffects[0].op).toBe('remove_abilities');
            expect(subEffects[1].op).toBe('damage');
            expect(subEffects[1].amount).toBe(9);

            // 2. Add Leader Damage Bonus
            const bonusOp = fanfare[1];
            expect(bonusOp.op).toBe('add_leader_damage_taken_bonus');
            expect(bonusOp.target).toBe('enemy:leader');
            expect(bonusOp.amount).toBe(1);
        });
    });
});
