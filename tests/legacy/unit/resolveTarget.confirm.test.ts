/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/unit/resolveTarget.confirm.test.ts
 * Reason: Missing UI adapter mock
 * Classification: BROKEN: harness/infra rot
 * 
 * POLICY: Do not fix by changing engine code.
 */
// tests/unit/resolveTarget.confirm.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget";
import { state } from "../../src/core/gameState";
import * as uiTargeting from "../../src/ui/targeting";
import * as fuseOps from "../../src/logic/effects/ops/fuse/fuse";

// Mock dependencies
vi.mock("../../src/ui/targeting", () => ({
    showTargetConfirmationButton: vi.fn(),
    hideTargetConfirmation: vi.fn(),
    triggerConfirmButtonClick: vi.fn(),
}));

vi.mock("../../src/logic/effects/ops/fuse/fuse", () => ({
    fuse_finalize_loot: vi.fn(),
    fuse_finalize_generic: vi.fn(),
    fuse_finalize_fortifier: vi.fn(),
    fuse_finalize_alpha: vi.fn(),
    fuse_finalize_gear_multi: vi.fn(),
    fuse_finalize_gardens_allure: vi.fn(),
}));

// Mock History
vi.mock("../../src/core/history", () => ({
    doAction: (name: string, fn: Function) => fn(), // Execute immediately
}));

// Mock Adapter
vi.mock("../../src/core/adapter", () => ({
    adapter: { render: vi.fn() },
}));

describe("resolveTarget Confirm Flow (Phase 3)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset state helper
        state.pendingTargetEffect = null;
        state.blueBoard = [];
        state.redBoard = [];
    });

    it("should route fuse_finalize_loot through dispatcher when confirmed via UI callback", () => {
        // 1. Setup State
        const targetCard = { uid: "t1", name: "Target", type: "Follower" };
        const sourceCard = { uid: "s1", name: "Source" };

        state.blueBoard = [targetCard as any];
        state.pendingTargetEffect = {
            eff: {
                op: "fuse_finalize_loot",
                initiator_uid: "s1"
            },
            owner: "blue",
            sourceCard: sourceCard as any,
            targets: [], // Start empty
            pool: [targetCard], // Valid pool
            requiresConfirmation: true,
            selectCount: 1
        };

        // 2. Select the target (triggers showConfirmationButton internal call)
        resolvePendingTarget("t1");

        // 3. Verify UI was asked to show button
        expect(uiTargeting.showTargetConfirmationButton).toHaveBeenCalledTimes(1);

        // 4. Capture the callback
        const callArgs = (uiTargeting.showTargetConfirmationButton as any).mock.calls[0][0];
        expect(callArgs).toHaveProperty("onConfirm");
        expect(typeof callArgs.onConfirm).toBe("function");

        // 5. Invoke the callback directly (simulating button click)
        callArgs.onConfirm();

        // 6. Verify Dispatcher execution
        // The handler for "fuse_finalize_loot" should call opFinalizeLootFuse (which is mirrored as fuse_finalize_loot in our mock)
        expect(fuseOps.fuse_finalize_loot).toHaveBeenCalledWith("blue", "s1", expect.any(Array));

        // Verify args contain the target
        const calledTargets = (fuseOps.fuse_finalize_loot as any).mock.calls[0][2];
        expect(calledTargets).toHaveLength(1);
        expect(calledTargets[0].uid).toBe("t1");

        // 7. Verify Cleanup
        expect(uiTargeting.hideTargetConfirmation).toHaveBeenCalled();
        expect(state.pendingTargetEffect).toBeUndefined();
    });
});
