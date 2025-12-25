// src/logic/effects/ops/spellboost/types.ts

import { Effect } from "../../../../core/types/index.js";

export type SpellboostTarget = "hand" | "self";
export type SpellboostMode = "boost" | "set";

export interface UnifiedSpellboostSpec {
  op: "spellboost";
  target: SpellboostTarget;
  mode?: SpellboostMode; // default: "boost"
  count?: number | string; // for boost: number of times, for set: target value
}

/**
 * Normalize legacy spellboost ops to unified spec.
 */
export function normalizeToSpellboostSpec(eff: Effect): UnifiedSpellboostSpec {
  const op = eff.op as string;
  const count =
    (eff as any).count ?? (eff as any).times ?? (eff as any).amount ?? 1;

  // Handle new unified format
  if (op === "spellboost" && (eff as any).target) {
    return {
      op: "spellboost",
      target: (eff as any).target || "hand",
      mode: (eff as any).mode || "boost",
      count,
    };
  }

  // Legacy op normalization
  switch (op) {
    case "spellboost":
    case "spellboost_hand":
      return { op: "spellboost", target: "hand", mode: "boost", count };

    case "spellboost_target":
      return { op: "spellboost", target: "self", mode: "boost", count: 1 };

    case "set_spellboost_count":
      return { op: "spellboost", target: "self", mode: "set", count };

    // Legacy transform_self_if_spellboost_at_least was removed
    // Now handled by: { op: "gate", condition: "spellboost_count", count: N, effects: [{ op: "transform", zone: "self", into: "..." }] }

    default:
      return { op: "spellboost", target: "hand", mode: "boost", count };
  }
}















