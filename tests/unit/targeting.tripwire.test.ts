// tests/unit/targeting.tripwire.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    dispatchTargetedOp,
    // @ts-ignore
    __registerMockHandler
} from "../../src/logic/effects/ops/targeted/index.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { clearSelectableFlags } from "../../src/logic/core/targeting.js";
import { adapter } from "../../src/core/adapter.js";
import { TargetedOpContext } from "../../src/logic/core/targeting/types.js";
import { startDispatch, endDispatch, runWithBypass } from "../../src/logic/core/targeting/guards.js";

// Mock dependencies to avoid crashes in dependencies of instrumented functions
vi.mock("../../src/core/gameState.js", () => ({
    state: { blueBoard: [], redBoard: [], blueHand: [], redHand: [] }
}));
vi.mock("../../src/core/adapter.js", async () => {
    // We want the REAL adapter object logic (guards), but mocked methods?
    // Actually adapter.ts exports a real object.
    // If we import it via actual, we get the real object with guards.
    const actual = await vi.importActual("../../src/core/adapter.js");
    return actual;
});
// Mock guard to Force IsDev = true behavior?
// guardLifecycle checks process.env.NODE_ENV !== "production".
// In vitest it is 'test' or 'development'. So checking is active.

describe("Targeting Tripwires", () => {

    it("throws if handler calls runEffects (illegal lifecycle)", () => {
        // Register bad handler
        const BAD_OP = "illegal_run_effects";
        __registerMockHandler(BAD_OP, (ctx: any) => {
            runEffects([], "blue", null); // Should trip
            return { kind: "handled" };
        });

        const ctx = { eff: { op: BAD_OP }, owner: "blue", targets: [] } as any;

        expect(() => dispatchTargetedOp(ctx)).toThrow(/Targeted op handler illegally invoked lifecycle function: runEffects/);
    });

    it("throws if handler calls adapter.render (illegal UI)", () => {
        const BAD_OP = "illegal_render";
        __registerMockHandler(BAD_OP, (ctx: any) => {
            adapter.render();
            return { kind: "handled" };
        });

        const ctx = { eff: { op: BAD_OP }, owner: "blue", targets: [] } as any;

        expect(() => dispatchTargetedOp(ctx)).toThrow(/Targeted op handler illegally invoked lifecycle function: adapter.render/);
    });

    it("throws if handler calls clearSelectableFlags (illegal cleanup)", () => {
        const BAD_OP = "illegal_cleanup";
        __registerMockHandler(BAD_OP, (ctx: any) => {
            clearSelectableFlags();
            return { kind: "handled" };
        });

        const ctx = { eff: { op: BAD_OP }, owner: "blue", targets: [] } as any;

        expect(() => dispatchTargetedOp(ctx)).toThrow(/Targeted op handler illegally invoked lifecycle function: clearSelectableFlags/);
    });

    it("allows runEffects if explicitly bypassed (nested_effects simulation)", () => {
        // This tests if the guard mechanism CAN be bypassed (which we use in nested_effects).
        // But effectively we already tested nested_effects relies on it.
        // We can't easily test the bypass without calling setTargetedOpDispatchActive(false) which is what nested_effects does.
        // And that function is internal? No, setTargetedOpDispatchActive is exported from "guards.ts".
        // We can test that.

        const SAFE_OP = "safe_but_nested";
        __registerMockHandler(SAFE_OP, (ctx: any) => {
            runWithBypass(() => {
                runEffects([], "blue", null);
            });
            return { kind: "handled" };
        });

        const ctx = { eff: { op: SAFE_OP }, owner: "blue", targets: [] } as any;
        expect(() => dispatchTargetedOp(ctx)).not.toThrow();
    });

    it("throws if runWithBypass is attempted on non-whitelisted op", () => {
        const BAD_OP = "illegal_bypass_attempt";
        __registerMockHandler(BAD_OP, (ctx: any) => {
            runWithBypass(() => { }); // Should throw
            return { kind: "handled" };
        });

        const ctx = { eff: { op: BAD_OP }, owner: "blue", targets: [] } as any;
        expect(() => dispatchTargetedOp(ctx)).toThrow(/Illegal guard bypass attempt/);
    });
});
