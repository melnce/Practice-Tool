// src/logic/effects/ops/cost/types.ts

import type { Effect } from "../../../../core/types/index.js";
import { isDev } from "../../../../core/env.js";

export type CostTarget =
  | "self"
  | "selected"
  | "pool"
  | "opponent_hand"
  | "last_drawn"
  | "last_added_to_hand";
export type CostMode = "reduce" | "set" | "modify" | "increase";

/** Allowed cost.action values — aliased to mode in normalizeToCostSpec */
export const COST_ACTION_VALUES = new Set([
  "reduce",
  "set",
  "modify",
  "increase",
]);

export interface UnifiedCostSpec {
  op: "cost";
  target: CostTarget;
  mode: CostMode;
  amount: number | string;
  pool?: string; // for target: "pool" - e.g. "ally:hand"
  condition?: any; // filter for pool
  filter?: { type?: string; tribe?: string; class?: string; name?: string }; // additional pool filter
  select?: number; // number of targets to select (triggers selection UI)
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
    // Card JSON sometimes uses "action" where the unified op expects "mode"
    if ((eff as any).mode === undefined && (eff as any).action) {
      const act = String((eff as any).action).toLowerCase();
      if (COST_ACTION_VALUES.has(act)) {
        (eff as any).mode = act;
      } else {
        const msg = `[cost] Unknown action "${(eff as any).action}"`;
        if (isDev()) {
          throw new Error(msg);
        }
        console.warn(msg);
      }
    }

    // ====================================================================
    // STRICT VALIDATION
    // ====================================================================
    if ((eff as any).target === undefined) {
      throw new Error(
        `[cost] Missing required field: "target". Must be "self", "selected", "pool", "opponent_hand", "last_drawn", "last_added_to_hand", or a pool spec like "ally:hand". Effect: ${JSON.stringify(eff)}`,
      );
    }
    if ((eff as any).mode === undefined) {
      throw new Error(
        `[cost] Missing required field: "mode". Must be "reduce", "set", "modify", or "increase". Effect: ${JSON.stringify(eff)}`,
      );
    }

    let rawTarget = (eff as any).target as string;
    const validTargets = [
      "self",
      "selected",
      "pool",
      "opponent_hand",
      "last_drawn",
      "last_added_to_hand",
    ];

    // Card JSON uses selected:follower / selected:amulet; unified op uses "selected" + targetUids
    if (rawTarget.startsWith("selected:")) {
      rawTarget = "selected";
    }

    // Detect pool-style targets (e.g., "ally:hand", "enemy:follower")
    const isPoolTarget =
      rawTarget.includes(":") && !validTargets.includes(rawTarget);

    // Normalize minCost to min_cost
    const minCost = (eff as any).min_cost ?? (eff as any).minCost;

    return {
      op: "cost",
      target: isPoolTarget ? "pool" : (rawTarget as CostTarget),
      mode: (eff as any).mode,
      amount,
      pool: isPoolTarget ? rawTarget : (eff as any).pool,
      condition: (eff as any).condition,
      filter: (eff as any).filter,
      select: (eff as any).select,
      min_cost: minCost,
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
