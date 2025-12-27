// tests/unit/resolveTarget.dispatcher.test.ts
// Phase 1.5: Verify dispatcher handler registration
// Phase 3 Update: Removed legacy sentinel tests (strict contract enforcement replaced it)

import { describe, it, expect } from "vitest";

// Import test accessors directly (setup.ts provides global mocks)
import { __getRegisteredTargetedOps } from "../../src/logic/core/resolveTarget";

describe("resolveTarget.ts Dispatcher Registration", () => {
  const EXPECTED_OPS = [
    "damage",
    "transform",
    "keyword",
    "discard_select_hand",
    "stat",
    "banish",
    "return", // Unified return op (replaced return_to_hand, bounce, return_hand_to_deck)
    "remove_keyword",
    "destroy",
    "destroy_then",
    "super_evolve_ally",
    "super_evolve_self",
    "evolve_and_buff",
    "fuse", // Unified fuse op (replaced 6 fuse_finalize_* handlers)
    // Legacy summon ops (select_hand_summon_artifact_*) now routed through unified summon
    "nested_effects",
  ];

  describe("Handler Registration", () => {
    it("should register all 15 expected targeted ops", () => {
      const registeredOps = __getRegisteredTargetedOps();
      expect(registeredOps).toHaveLength(15);
    });

    it("should register damage handler", () => {
      expect(__getRegisteredTargetedOps()).toContain("damage");
    });

    it("should register destroy handler", () => {
      expect(__getRegisteredTargetedOps()).toContain("destroy");
    });

    it("should register buff handler", () => {
      expect(__getRegisteredTargetedOps()).toContain("stat");
    });

    it("should register transform handler", () => {
      expect(__getRegisteredTargetedOps()).toContain("transform");
    });

    it("should register fuse handler", () => {
      const ops = __getRegisteredTargetedOps();
      expect(ops).toContain("fuse");
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






