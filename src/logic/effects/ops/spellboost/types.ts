// src/logic/effects/ops/spellboost/types.ts

import type { Effect } from "../../../../core/types/index.js";

/**
 * CANONICAL FORMAT:
 * - target: "ally:hand" | "self" | "selected" (explicit player context, never just "hand")
 * - mode: "boost" | "set"
 * - count: number of times to boost or value to set
 *
 * "selected" resolves chosen cards from context.targetUids (nested select child).
 * "self" boosts the ability owner (sourceCard). "ally:hand" boosts the whole hand.
 */
export type SpellboostTarget = "ally:hand" | "self" | "selected";
export type SpellboostMode = "boost" | "set";

export interface UnifiedSpellboostSpec {
  op: "spellboost";
  target: SpellboostTarget;
  mode: SpellboostMode;
  count: number | string;
}

function normalizeSpellboostTarget(target: unknown): SpellboostTarget | null {
  if (target === "ally:hand" || target === "self" || target === "selected") {
    return target;
  }
  // parser.ts also allows "selected:<subtype>"; fold to bare "selected".
  if (typeof target === "string" && target.startsWith("selected:")) {
    return "selected";
  }
  return null;
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

  const rawTarget = (eff as any).target;
  const target = normalizeSpellboostTarget(rawTarget);
  if (!target) {
    throw new Error(
      `[spellboost] Invalid target: "${rawTarget}". Must be "ally:hand", "self", or "selected". Effect: ${JSON.stringify(eff)}`,
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

  let normalizedCount: number | string;
  if (typeof count === "number") {
    normalizedCount = count;
  } else if (typeof count === "string" && count.includes("{")) {
    normalizedCount = count;
  } else {
    normalizedCount = parseInt(String(count), 10) || 1;
  }

  return {
    op: "spellboost",
    target,
    mode,
    count: normalizedCount,
  };
}
