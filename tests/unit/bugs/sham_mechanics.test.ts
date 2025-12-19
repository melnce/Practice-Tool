
import { describe, it, expect, beforeEach } from 'vitest';
import { computeHandGlow } from '../../../src/ui/helpers/glow';
import { state, resetGameState } from '../../../src/core/gameState';
import { handleGainCrest, crestAddCounter } from '../../../src/logic/effects/crest';
import { runEffects } from '../../../src/logic/core/effects/index';
// import { adapter } from '../../../src/core/adapter'; // not strictly needed for logic tests

describe('Sham-Nacha Mechanics', () => {
    beforeEach(() => {
        resetGameState();
        (globalThis as any).HEADLESS = true;
    });

    it('should glow yellow if and only if Faith >= 10', () => {
        // Setup Faith Crest
        handleGainCrest({ name: "Faith: Sham-Nacha, Heir to Entwining" } as any, "blue");

        const card = { name: "Sham-Nacha, Heir to Entwining", type: "Follower", cost: 2, fanfare: [] } as any;
        const ctx = { state, owner: "blue", isPlayersTurn: true, availablePP: 10, isSpell: false };

        // Case 1: Faith < 10
        crestAddCounter("blue", "Faith: Sham-Nacha, Heir to Entwining", "faith", 9);
        let res = computeHandGlow(card, ctx);
        console.log("Faith 9 Glow:", res.glowClass);
        expect(res.glowClass).not.toBe("enhance-ready");
        expect(res.glowClass).toBe("playable-glow");

        // Case 2: Faith = 10
        crestAddCounter("blue", "Faith: Sham-Nacha, Heir to Entwining", "faith", 1); // 9+1=10
        res = computeHandGlow(card, ctx);
        console.log("Faith 10 Glow:", res.glowClass);
        expect(res.glowClass).toBe("enhance-ready");
    });

    it('should consume 10 faith and grant Choose Bonus', () => {
        // Setup
        handleGainCrest({ name: "Faith: Sham-Nacha, Heir to Entwining" } as any, "blue");
        crestAddCounter("blue", "Faith: Sham-Nacha, Heir to Entwining", "faith", 15);
        state.blueChooseBonus = 0;

        // Simulate Sham-Nacha Fanfare Effect
        const fanfare = [{
            op: "crest_pay_counter",
            crest: "Faith: Sham-Nacha, Heir to Entwining",
            counter: "faith",
            amount: 10,
            on_success_effects: [
                { op: "choose_bonus_add", amount: 1 }
            ]
        }];

        runEffects(fanfare as any, "blue", null);

        // Verify Consumption
        const crest = state.blueCrests.find(c => c.name.includes("Sham-Nacha"));
        expect(crest.counters.faith).toBe(5); // 15 - 10 = 5

        // Verify Bonus
        expect(state.blueChooseBonus).toBe(1);
    });
});
