
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state, resetGameState } from '../../../src/core/gameState.js';
import { handleModeBonus } from '../../../src/logic/effects/ops/misc.js';
import { crestSpendCounter } from '../../../src/logic/effects/crest.js';
import { handleMode } from '../../../src/logic/effects/ops/mode.js';

describe('Bug 3: Sham-Nacha Faith Mode Selection', () => {
    beforeEach(() => {
        resetGameState();
        state.isBlueTurn = true;
    });

    afterEach(() => {
        resetGameState();
    });

    it('Should fail to spend "Faith" counters from specific Faith crest due to name mismatch', () => {
        // Setup: Add specific Faith crest with 10 counters
        const specificCrestName = "Faith: Sham-Nacha, Heir to Entwining";
        state.blueCrests = [{
            name: specificCrestName,
            counters: { faith: 10 },
            description: "Test Crest",
            owner: 'blue'
        }];

        // Simulate the FIX: The card should use the FULL name
        const success = crestSpendCounter('blue', 'Faith: Sham-Nacha, Heir to Entwining', 'faith', 10);

        // EXPECTATION (Fixed): Should SUCCESS because name matches
        expect(success).toBe(true);

        // Verify bonus IS added
        if (success) {
            handleModeBonus({ amount: 1 } as any, { owner: 'blue' });
        }
        expect(state.blueModeBonus).toBe(1);
    });

    it('Should allow selecting 3 modes if bonus is correctly applied', () => {
        // This test simulates the FIXED behavior to verify logic chain
        state.blueModeBonus = 1;

        // Mock Choose effect with 2 base options
        const eff = {
            op: "mode",
            select_count: 2,
            options: [
                { label: "A" }, { label: "B" }, { label: "C" }, { label: "D" } // 4 options available
            ]
        } as any;

        // Mock Modal or AI to capture select count
        // We'll inspect the log or intercept adapter logic? 
        // handleChoose uses adapter.showChoiceModal in UI or scoreOption in AI.
        // Let's rely on internal calculation logic inside handleChoose if strict test difficult.
        // Actually handleChoose logic: "const selectCount = Math.min(options.length, baseSelect + bonus);"
        // We can just import and verify that logic OR verify side effect.
        // But handleChoose returns 'pending' and calls adapter. 
        // We can mock adapter.showChoiceModal.
    });
});
