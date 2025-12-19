
import { describe, it, expect, beforeEach } from 'vitest';
import { state, resetGameState } from '../../../src/core/gameState';
import { handleGainCrest } from '../../../src/logic/effects/crest';
import { fireTrigger } from '../../../src/logic/core/triggers';
import { adapter } from '../../../src/core/adapter';

(globalThis as any).HEADLESS = true;

describe('Bug: Faith Owner Isolation', () => {
    beforeEach(() => {
        resetGameState();
        adapter.render = () => { };
    });

    it('should only increment the active player crest when select_mode is fired', () => {
        // 1. Grant Crest to BOTH players
        const crestDef = {
            op: "gain_crest",
            name: "Faith: Sham-Nacha, Heir to Entwining",
            triggers: [{
                event: "select_mode",
                effects: [{ op: "crest_add_counter", crest: "Faith: Sham-Nacha, Heir to Entwining", counter: "faith", amount: 1 }]
            }]
        };

        handleGainCrest(crestDef as any, "blue");
        handleGainCrest(crestDef as any, "red");

        // Verify both exist
        const blueCrest = state.blueCrests.find(c => c.name === "Faith: Sham-Nacha, Heir to Entwining");
        const redCrest = state.redCrests.find(c => c.name === "Faith: Sham-Nacha, Heir to Entwining");

        expect(blueCrest).toBeDefined();
        expect(redCrest).toBeDefined();
        expect(blueCrest!.owner).toBe("blue");
        expect(redCrest!.owner).toBe("red");

        // 2. Fire select_mode for BLUE
        console.log(" firing select_mode for BLUE...");
        fireTrigger("select_mode", "blue", { sourceCard: null });

        // 3. Verify ONLY Blue increased
        expect(blueCrest!.counters?.faith || 0).toBe(1);
        expect(redCrest!.counters?.faith || 0).toBe(0); // Should stay 0
    });
});
