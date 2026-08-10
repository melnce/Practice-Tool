// src/logic/effects/ops/spellboost/types.ts

import type { Effect } from "../../../../core/types/index.js";

/**
 * CANONICAL FORMAT:
 * - target: "ally:hand" | "self" (explicit player context, never just "hand")
 * - mode: "boost" | "set"
 * - count: number of times to boost or value to set
 */
export type SpellboostTarget = "ally:hand" | "self";
export type SpellboostMode = "boost" | "set";

export interface UnifiedSpellboostSpec {
  op: "spellboost";
  target: SpellboostTarget;
  mode: SpellboostMode;
  count: number;
}

/**
 * Normalize spellboost ops to unified spec.
 * STRICT: Throws on invalid format.
 */
export function normalizeToSpellboostSpec(eff: Effect): UnifiedSpellboostSpec {
  const op = eff.op as string;

  if (op !== "spellboost") {
    throw new Error(`[spellboost] Invalid op: "${op}". Must be "spellboost".`);
  }

  const target = (eff as any).target;
  if (target !== "ally:hand" && target !== "self") {
    throw new Error(
      `[spellboost] Invalid target: "${target}". Must be "ally:hand" or "self". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const mode = (eff as any).mode || "boost";
  if (mode !== "boost" && mode !== "set") {
    throw new Error(
      `[spellboost] Invalid mode: "${mode}". Must be "boost" or "set". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const count =
    (eff as any).count ?? (eff as any).times ?? (eff as any).amount ?? 1;

  return {
    op: "spellboost",
    target,
    mode,
    count: typeof count === "number" ? count : parseInt(String(count), 10) || 1,
  };
}
