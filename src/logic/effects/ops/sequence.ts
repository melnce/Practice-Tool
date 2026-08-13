// src/logic/effects/ops/sequence.ts
// Sticky sequential ability runner — advances a per-card counter across turns.
//
// { "op": "sequence", "key": "babelon", "advance": true, "steps": [ { effects: [...] }, ... ] }
//
// Index is stored on sourceCard.counters[key] (0-based). Each call runs the
// current step's effects, then increments when advance !== false. After the
// last step the index clamps at steps.length (no wrap) so subsequent calls
// are no-ops unless the card is destroyed by the final step.

import { runEffects } from "../../core/effects/index.js";
import { logEvent } from "../../../core/logger.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../core/types/index.js";

export function handleSequence(
  eff: Effect & Record<string, any>,
  owner: Player,
  sourceCard: CardInstance | null,
): void {
  const steps = Array.isArray(eff.steps) ? eff.steps : [];
  if (!steps.length || !sourceCard) return;

  const key = String(eff.key || "sequence").trim() || "sequence";
  sourceCard.counters = sourceCard.counters || {};
  const raw = Number(sourceCard.counters[key] ?? 0);
  const index = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;

  if (index >= steps.length) {
    logEvent("sequence_exhausted", {
      owner,
      key,
      card: sourceCard.name,
      index,
    });
    return;
  }

  const step = steps[index];
  const effects = Array.isArray(step?.effects)
    ? step.effects
    : Array.isArray(step)
      ? step
      : [];

  logEvent("sequence_run", {
    owner,
    key,
    card: sourceCard.name,
    index,
    steps: steps.length,
  });

  if (effects.length) {
    runEffects(structuredClone(effects) as Effect[], owner, sourceCard);
  }

  if (eff.advance !== false) {
    sourceCard.counters[key] = index + 1;
  }
}
