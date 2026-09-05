import { describe, it, expect } from "vitest";
import { __getRegisteredTargetedOps } from "../../src/logic/core/resolveTarget.js";
import "../../src/logic/core/effects/index.js";

const EXPECTED_TARGETED_OPS = [
  "attacks_per_turn",
  "banish",
  "cost",
  "damage",
  "destroy",
  "destroy_then",
  "discard",
  "discard_select_hand",
  "evolve",
  "evolve_and_buff",
  "fuse",
  "keyword",
  "nested_effects",
  "remove_keyword",
  "return",
  "select_hand_summon_artifact_copies_eot_destroy",
  "select_hand_summon_artifact_copy",
  "select_hand_summon_follower",
  "stat",
  "super_evolve_ally",
  "super_evolve_self",
  "transform",
] as const;

describe("resolveTarget.ts dispatcher registration", () => {
  it("registers exactly the expected targeted ops", () => {
    const registered = [...__getRegisteredTargetedOps()].sort();
    expect(registered).toEqual([...EXPECTED_TARGETED_OPS]);
  });
});
