// src/logic/effects/ops/return/types.ts
// Unified return operation types

export type ReturnDestination = "hand" | "deck";

export interface UnifiedReturnSpec {
  op: "return";
  destination: ReturnDestination;
  target?: string; // e.g. "self", "ally:follower", "selected:ally"
  select?: number | "all";
  select_count?: number;
  optional?: boolean;
  all?: boolean;
  condition?: any;
  filters?: any;
}

/**
 * Normalize legacy return ops to unified format.
 * NOTE: For reference during migration.
 */
export function normalizeToReturnSpec(eff: any): UnifiedReturnSpec {
  switch (eff.op) {
    case "return_to_hand":
      return {
        op: "return",
        destination: "hand",
        target: eff.target ?? "self",
        select: eff.select,
        select_count: eff.select_count,
        condition: eff.condition,
        filters: eff.filters,
      };
    case "bounce":
      return {
        op: "return",
        destination: "hand",
        target: eff.target ?? "enemy:follower",
        select: eff.select,
        select_count: eff.select_count,
        condition: eff.condition,
        filters: eff.filters,
      };
    case "return_hand_to_deck":
      return {
        op: "return",
        destination: "deck",
        select: eff.select,
        select_count: eff.select_count,
        optional: eff.optional,
        all: eff.all,
      };
    case "return":
      return eff as UnifiedReturnSpec;
    default:
      throw new Error(`Unknown return op: ${eff.op}`);
  }
}















