/**
 * MOVED TO LEGACY
 * 
 * Original Path: tests/unit/targeting.contract.test.ts
 * Reason: Missing UI adapter mock
 * Classification: BROKEN: harness/infra rot
 * 
 * POLICY: Do not fix by changing engine code.
 */
// tests/unit/targeting.contract.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { state } from "../../src/core/gameState.js";
import * as engine from "../../src/logic/core/targeting/engine.js";
import * as dispatcher from "../../src/logic/effects/ops/targeted/index.js";
import * as effects from "../../src/logic/core/effects/index.js";
import * as cleanup from "../../src/logic/core/targeting.js"; // clearSelectableFlags
import * as ui from "../../src/ui/targeting.js";
import { adapter } from "../../src/core/adapter.js";

// Mocks
vi.mock("../../src/core/gameState.js", () => ({
    state: {
        pendingTargetEffect: null,
        pendingTargetAction: null
    }
}));
vi.mock("../../src/core/adapter.js", () => ({
    adapter: { render: vi.fn() }
}));
vi.mock("../../src/logic/core/targeting/engine.js");
vi.mock("../../src/logic/effects/ops/targeted/index.js");
vi.mock("../../src/logic/core/effects/index.js");
vi.mock("../../src/logic/core/targeting.js");
vi.mock("../../src/ui/targeting.js");

describe("Targeting Orchestrator Contract", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        state.pendingTargetEffect = {
            eff: { op: "test_op" },
            owner: "blue",
            targets: [],
            resumeEffects: []
        } as any;
    });

    it("Orchestrator performs cleanup and resume when Dispatcher returns 'handled'", () => {
        // Setup Engine to return Execute
        const mockOpCtx = { eff: { op: "test_op" }, owner: "blue", targets: [], resumeEffects: [{ op: "resume" }] };
        vi.mocked(engine.applyTargetClick).mockReturnValue({
            kind: "execute",
            opCtx: mockOpCtx as any
        });

        // Setup Dispatcher to return HANDLED
        vi.mocked(dispatcher.dispatchTargetedOp).mockReturnValue({ kind: "handled" });

        // Execute
        resolvePendingTarget("target_uid");

        // Assertions
        expect(dispatcher.dispatchTargetedOp).toHaveBeenCalledWith(mockOpCtx);

        // Contract: Must cleanup
        expect(state.pendingTargetEffect).toBeUndefined(); // Deleted
        expect(cleanup.clearSelectableFlags).toHaveBeenCalled();
        expect(ui.hideTargetConfirmation).toHaveBeenCalled();

        // Contract: Must resume effects (since resumeEffects provided)
        expect(effects.runEffects).toHaveBeenCalledWith(mockOpCtx.resumeEffects, "blue", undefined);
    });

    it("Orchestrator runs render (not resume) if no resumeEffects present", () => {
        const mockOpCtx = { eff: { op: "test_op" }, owner: "blue", targets: [], resumeEffects: [] };
        vi.mocked(engine.applyTargetClick).mockReturnValue({
            kind: "execute",
            opCtx: mockOpCtx as any
        });
        vi.mocked(dispatcher.dispatchTargetedOp).mockReturnValue({ kind: "handled" });

        // Adapter import is mocked at top level
        // expect(adapter.render).toHaveBeenCalled();

        resolvePendingTarget("target_uid");

        expect(effects.runEffects).not.toHaveBeenCalled();
        expect(adapter.render).toHaveBeenCalled(); // from cleanup else path
    });

    it("Orchestrator DOES NOT cleanup when Dispatcher returns 'paused'", () => {
        const mockOpCtx = { eff: { op: "test_op" }, owner: "blue", targets: [], resumeEffects: [] };
        vi.mocked(engine.applyTargetClick).mockReturnValue({ kind: "execute", opCtx: mockOpCtx as any });

        // Setup Dispatcher to return PAUSED
        vi.mocked(dispatcher.dispatchTargetedOp).mockReturnValue({ kind: "paused" });

        resolvePendingTarget("target_uid");

        // Contract: Must NOT cleanup
        expect(state.pendingTargetEffect).toBeDefined();
        expect(cleanup.clearSelectableFlags).not.toHaveBeenCalled();
    });

    it("Orchestrator throws if Dispatcher throws (Unknown Op)", () => {
        vi.mocked(engine.applyTargetClick).mockReturnValue({ kind: "execute", opCtx: {} as any });
        vi.mocked(dispatcher.dispatchTargetedOp).mockImplementation(() => {
            throw new Error("[dispatchTargetedOp] No handler for op: unknown");
        });

        expect(() => resolvePendingTarget("uid")).toThrow("[dispatchTargetedOp] No handler");
    });
});
