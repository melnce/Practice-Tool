
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as processModule from "../../../src/logic/core/triggers/process";

describe("processCandidateTriggers", () => {
    it("should handle 'end_of_turn_own' shorthand correctly", () => {
        // Mock dependencies
        const runEffects = vi.fn();
        processModule.registerRunEffectsInProcess(runEffects);

        // Setup
        const owner = "blue";
        const opponent = "red";

        // Mock card
        const card: any = { name: "TestCard", type: "Follower", uid: "1" };

        // Mock trigger with shorthand
        const triggerOwn: any = {
            type: "end_of_turn_own", // The shorthand
            event: undefined, // undefined implies reliance solely on type aliasing logic we added
            effects: [{ op: "damage" }]
        };

        const candidate: any = {
            card: card,
            owner: owner,
            source: "board",
            triggers: [triggerOwn]
        };

        const context: any = { _turnNumber: 1 };

        // Test 1: Active Player is Owner (Should Fire)
        // Note: processCandidateTriggers is modifying state or calling runEffects
        processModule.processCandidateTriggers([candidate], {
            event: "end_of_turn",
            activePlayer: owner as any,
            context: context
        });

        expect(runEffects).toHaveBeenCalledTimes(1);
        runEffects.mockClear();

        // Test 2: Active Player is Opponent (Should NOT Fire)
        processModule.processCandidateTriggers([candidate], {
            event: "end_of_turn",
            activePlayer: opponent as any,
            context: context
        });

        expect(runEffects).not.toHaveBeenCalled();
    });
});
