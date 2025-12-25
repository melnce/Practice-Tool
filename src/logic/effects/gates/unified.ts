// src/logic/effects/gates/unified.ts
// Unified gate handler - evaluates conditions via registry and queues effects

import { logEvent } from "../../../core/logger.js";
import { Player, CardInstance, Effect } from "../../../core/types/index.js";
import { normalizeToGateSpec } from "./types.js";
import { evaluateCondition } from "./conditions.js";

/**
 * Unified gate handler - evaluates any gate condition and queues effects.
 * Conditions are registered in conditions.ts for modularity and testability.
 */
export function handleGate(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
): "done" {
  const spec = normalizeToGateSpec(eff);
  const passed = evaluateCondition(spec, owner, sourceCard);

  logEvent("gate", {
    condition: spec.condition,
    passed,
    owner,
    card: sourceCard?.name,
  });

  const next = passed ? spec.effects || [] : spec.else_effects || [];
  if (next.length && Array.isArray(effectsQueue)) {
    effectsQueue.unshift(...next);
  }

  return "done";
}
















