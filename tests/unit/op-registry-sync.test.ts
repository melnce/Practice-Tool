import { describe, it, expect } from "vitest";
import { ALL_OPS } from "../../src/logic/core/effects/opTypes.js";
import { OP_TOP_LEVEL_KEYS } from "../../scripts/op-keys-gate.js";
import { __getRegisteredTargetedOps } from "../../src/logic/effects/ops/targeted/index.js";

const PSEUDO_TARGETED_OPS = [
  "destroy_then",
  "discard_select_hand",
  "evolve_and_buff",
  "nested_effects",
  "remove_keyword",
  "select_hand_summon_artifact_copies_eot_destroy",
  "select_hand_summon_artifact_copy",
  "select_hand_summon_follower",
  "super_evolve_ally",
] as const;

describe("op registry sync", () => {
  it("ALL_OPS and OP_TOP_LEVEL_KEYS have the same keys", () => {
    const allOps = new Set<string>(ALL_OPS as readonly string[]);
    const gateOps = new Set(Object.keys(OP_TOP_LEVEL_KEYS));

    const missingInGate = [...allOps].filter((op) => !gateOps.has(op)).sort();
    const missingInAllOps = [...gateOps].filter((op) => !allOps.has(op)).sort();

    expect(
      { missingInGate, missingInAllOps },
      `ALL_OPS (${allOps.size}) and OP_TOP_LEVEL_KEYS (${gateOps.size}) diverged — missing in gate: ${missingInGate.join(", ") || "none"}; missing in ALL_OPS: ${missingInAllOps.join(", ") || "none"}`,
    ).toEqual({ missingInGate: [], missingInAllOps: [] });
  });

  it("TARGETED_OP_HANDLERS intersects ALL_OPS consistently", () => {
    const allOps = new Set<string>(ALL_OPS as readonly string[]);
    const targeted = __getRegisteredTargetedOps();
    const pseudo = new Set<string>(PSEUDO_TARGETED_OPS);

    expect(targeted).toHaveLength(22);
    expect(pseudo.size).toBe(PSEUDO_TARGETED_OPS.length);

    const intersection = targeted.filter((op) => allOps.has(op)).sort();
    const expectedIntersection = targeted
      .filter((op) => !pseudo.has(op))
      .sort();

    expect(intersection).toEqual(expectedIntersection);

    const computedPseudo = targeted.filter((op) => !allOps.has(op)).sort();
    expect(computedPseudo).toEqual([...PSEUDO_TARGETED_OPS].sort());

    const unexpectedPseudo = targeted.filter(
      (op) => !allOps.has(op) && !pseudo.has(op),
    );
    expect(unexpectedPseudo).toEqual([]);
  });
});
