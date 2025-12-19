/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/integration/keywords_targeting.test.ts
 * Reason: Cannot find module gameState.js
 * Classification: BROKEN: harness/infra rot
 * 
 * POLICY: Do not fix by changing engine code.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { state } from "../../src/logic/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { CardInstance, Effect } from "../../src/logic/core/types.js";

describe("Keyword Targeting Decoupling", () => {
    beforeEach(() => {
        state.pendingTargetEffect = null;
        state.blueBoard = [];
        state.redBoard = [];
    });

    test("handleKeyword returns request_target when selection is needed", () => {
        // Setup a scenario where a keyword effect needs to select a target
        const source = { uid: "s1", name: "Source", type: "Follower" } as CardInstance;
        const target1 = { uid: "t1", name: "Target1", type: "Follower" } as CardInstance;

        state.blueBoard = [source, target1];

        // Effect: Grant 'Rush' to 1 selected ally
        const effect: Effect = {
            op: "keyword",
            keyword: "rush",
            select: "ally",
            count: 1
        };

        // Run the effect via the orchestrator
        runEffects([effect], "blue", source);

        // Assert that the orchestrator caught the "request_target" from the keyword module
        // and set the pending state.
        expect(state.pendingTargetEffect).toBeDefined();
        expect(state.pendingTargetEffect?.eff).toBe(effect);
        expect(state.pendingTargetEffect?.pool).toContain(target1);
        expect(state.pendingTargetEffect?.selectCount).toBe(1);
    });

    test("handleKeyword applies directly when no selection needed", () => {
        const source = { uid: "s1", name: "Source", type: "Follower" } as CardInstance;
        state.blueBoard = [source];

        const effect: Effect = {
            op: "keyword",
            keyword: "ward",
            target: "self"
        };

        runEffects([effect], "blue", source);

        // No pending state, effect applied immediately
        expect(state.pendingTargetEffect).toBeNull();
        expect(source.hasWard).toBe(true);
    });
});
