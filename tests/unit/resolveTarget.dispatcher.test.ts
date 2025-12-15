// tests/unit/resolveTarget.dispatcher.test.ts
// Phase 1.5: Verify dispatcher handler registration
// Phase 3 Update: Removed legacy sentinel tests (strict contract enforcement replaced it)

import { describe, it, expect } from "vitest";

// Import test accessors directly (setup.ts provides global mocks)
import {
    __getRegisteredTargetedOps,
} from "../../src/logic/core/resolveTarget";

describe("resolveTarget.ts Dispatcher Registration", () => {
    const EXPECTED_OPS = [
        "damage",
        "transform",
        "keyword",
        "discard_select_hand",
        "buff",
        "banish",
        "return_to_hand",
        "bounce",
        "return_hand_to_deck",
        "remove_keyword",
        "destroy",
        "destroy_then",
        "damage_follower_or_leader",
        "super_evolve_ally",
        "super_evolve_self",
        "evolve_and_buff",
        "fuse_finalize_generic",
        "fuse_finalize_fortifier",
        "fuse_finalize_alpha",
        "fuse_finalize_gear_multi",
        "fuse_finalize_gardens_allure",
        "fuse_finalize_loot",
        "select_hand_summon_artifact_copies_eot_destroy",
        "select_hand_summon_artifact_copy",
        "nested_effects",
    ];

    describe("Handler Registration", () => {
        it("should register all 25 expected targeted ops", () => {
            const registeredOps = __getRegisteredTargetedOps();
            expect(registeredOps).toHaveLength(25);
        });

        it("should register damage handler", () => {
            expect(__getRegisteredTargetedOps()).toContain("damage");
        });

        it("should register destroy handler", () => {
            expect(__getRegisteredTargetedOps()).toContain("destroy");
        });

        it("should register buff handler", () => {
            expect(__getRegisteredTargetedOps()).toContain("buff");
        });

        it("should register transform handler", () => {
            expect(__getRegisteredTargetedOps()).toContain("transform");
        });

        it("should register fuse handlers", () => {
            const ops = __getRegisteredTargetedOps();
            expect(ops).toContain("fuse_finalize_generic");
            expect(ops).toContain("fuse_finalize_fortifier");
            expect(ops).toContain("fuse_finalize_alpha");
            expect(ops).toContain("fuse_finalize_gear_multi");
        });

        it("should register nested_effects handler", () => {
            expect(__getRegisteredTargetedOps()).toContain("nested_effects");
        });

        it("should have no unexpected handlers", () => {
            const registeredOps = __getRegisteredTargetedOps();
            for (const op of registeredOps) {
                expect(EXPECTED_OPS).toContain(op);
            }
        });
    });
});
