// src/logic/effects/ops/countdown/types.ts
// Types for unified countdown operation

import type { Effect } from "../../../../core/types/index.js";

export type CountdownAction = "advance" | "increase";

export interface CountdownSpec {
  op: "countdown";
  action: CountdownAction;
  amount?: number;
  target?: "self" | string;
  name?: string; // For crest targeting by name
}

/**
 * Normalize countdown spec.
 * STRICT MODE - only accepts "countdown" op with required fields.
 */
export function normalizeCountdownSpec(eff: Effect): CountdownSpec {
  const op = (eff as any).op;

  // ==========================================================================
  // STRICT: Only accept "countdown" op
  // ==========================================================================
  if (op !== "countdown") {
    throw new Error(
      `[countdown] Invalid op: "${op}". Legacy ops are removed. ` +
        `Use { "op": "countdown", "action": "advance"|"increase", ... }. ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // ==========================================================================
  // REQUIRED: action
  // ==========================================================================
  const action = (eff as any).action;
  if (!action || (action !== "advance" && action !== "increase")) {
    throw new Error(
      `[countdown] Missing or invalid field: "action". Must be "advance" or "increase". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  return {
    op: "countdown",
    action: action as CountdownAction,
    amount: (eff as any).amount,
    target: (eff as any).target,
    name: (eff as any).name,
  };
}
