// src/logic/effects/ops/cost/types.ts

import { Effect } from "../../../../core/types.js";

export type CostTarget =
  | "self"
  | "selected"
  | "pool"
  | "opponent_hand"
  | "last_drawn";
export type CostMode = "reduce" | "set" | "modify" | "increase";

export interface UnifiedCostSpec {
  op: "cost";
  target: CostTarget;
  mode: CostMode;
  amount: number | string;
  pool?: string; // for target: "pool" - e.g. "ally:hand"
  condition?: any; // filter for pool
  min_cost?: number; // floor for reduce
  until_eot?: boolean; // temporary mod, revert at end of turn
}

/**
 * Normalize legacy cost ops to unified spec.
 *
 * STRICT MODE: Throws on missing required fields for unified format.
 */
export function normalizeToCostSpec(eff: Effect): UnifiedCostSpec {
  const op = eff.op as string;
  const amount = eff.amount ?? 1;

  // Handle new unified format
  if (op === "cost") {
    // ====================================================================
    // STRICT VALIDATION
    // ====================================================================
    if ((eff as any).target === undefined) {
      throw new Error(
        `[cost] Missing required field: "target". Must be "self", "selected", "pool", "opponent_hand", or "last_drawn". Effect: ${JSON.stringify(eff)}`,
      );
    }
    if ((eff as any).mode === undefined) {
      throw new Error(
        `[cost] Missing required field: "mode". Must be "reduce", "set", "modify", or "increase". Effect: ${JSON.stringify(eff)}`,
      );
    }

    return {
      op: "cost",
      target: (eff as any).target,
      mode: (eff as any).mode,
      amount,
      pool: (eff as any).pool,
      condition: (eff as any).condition,
      min_cost: (eff as any).min_cost,
      until_eot: (eff as any).until_eot,
    };
  }

  // Legacy op normalization (fallback - should not be needed after migration)
  switch (op) {
    case "reduce_cost_self":
      return { op: "cost", target: "self", mode: "reduce", amount };

    case "set_cost_self":
      return { op: "cost", target: "self", mode: "set", amount };

    case "reduce_cost":
      return {
        op: "cost",
        target: "selected",
        mode: "reduce",
        amount,
        min_cost: (eff as any).minCost ?? 0,
      };

    case "modify_cost":
      return {
        op: "cost",
        target: "selected",
        mode: "modify",
        amount,
        until_eot: (eff as any).until_eot,
      };

    case "modify_cost_pool":
      return {
        op: "cost",
        target: "pool",
        mode: "modify",
        amount,
        pool: (eff as any).target || "ally:hand",
        condition: (eff as any).condition,
        until_eot: (eff as any).until_eot,
      };

    case "increase_opponent_hand_cost_eot":
      return {
        op: "cost",
        target: "opponent_hand",
        mode: "increase",
        amount,
        until_eot: true,
      };

    default:
      // Assume already unified format
      return {
        op: "cost",
        target: (eff as any).target || "self",
        mode: (eff as any).mode || "reduce",
        amount,
      };
  }
}
