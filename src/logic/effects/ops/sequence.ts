// src/logic/effects/ops/sequence.ts
// Sticky sequential ability runner — advances a per-card counter across turns.
//
// { "op": "sequence", "key": "babelon", "advance": true, "steps": [ { effects: [...] }, ... ] }
//
// Index is stored on sourceCard.counters[key] (0-based). Each call runs the
// current step's effects, then increments when advance !== false. After the
// last step the index wraps to 0 by default (`wrap: false` clamps at
// steps.length so subsequent calls are no-ops).

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
  const wrap = eff.wrap !== false;
  const raw = Number(sourceCard.counters[key] ?? 0);
  let index = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;

  if (index >= steps.length) {
    if (!wrap) {
      logEvent("sequence_exhausted", {
        owner,
        key,
        card: sourceCard.name,
        index,
      });
      return;
    }
    index = 0;
    sourceCard.counters[key] = 0;
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
    const next = index + 1;
    sourceCard.counters[key] = wrap && next >= steps.length ? 0 : next;
  }
}
