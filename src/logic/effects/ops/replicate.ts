// src/logic/effects/ops/replicate.ts
// Re-execute the card's Fanfare (or other zone) from live card data — fresh targeting.

import { state } from "../../../core/gameState.js";
import { getCardById } from "../../../data/cardIndex.js";
import { runEffects } from "../../core/effects/index.js";
import type { CardInstance, Effect } from "../../../core/types/index.js";
import type { EffectCtx } from "../../core/effects/registry.js";

export type ReplicateEffect = {
  op: "replicate";
  zone?: "fanfare" | "spell" | string;
};

function collectZoneEffects(card: CardInstance, zone: string): Effect[] {
  const template = card.id ? getCardById(String(card.id)) : null;
  const def = template ?? card;
  const raw = (def as Record<string, unknown>)[zone];
  if (Array.isArray(raw)) return structuredClone(raw) as Effect[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { effects?: Effect[] }).effects)
  ) {
    return structuredClone((raw as { effects: Effect[] }).effects);
  }
  return [];
}

/**
 * Replicate a card ability zone (default fanfare) at resolve time.
 * Uses template lookup so balance changes to fanfare[] propagate.
 */
export function handleReplicate(
  eff: ReplicateEffect,
  ctx: EffectCtx,
): "pending" | void {
  const source = ctx.sourceCard;
  if (!source) return;

  const zone = eff.zone ?? "fanfare";
  const effects = collectZoneEffects(source, zone);
  if (!effects.length) return;

  const innerContext: Record<string, unknown> = {
    ...(typeof ctx.context === "object" && ctx.context ? ctx.context : {}),
  };
  delete innerContext.targetUids;
  delete innerContext.targets;

  runEffects(effects, ctx.owner, source, innerContext);

  if (state.pendingTargetEffect) {
    const pending = state.pendingTargetEffect;
    const outerResume = Array.isArray(ctx.queue) ? [...ctx.queue] : [];
    const innerResume = Array.isArray(pending.resumeEffects)
      ? [...pending.resumeEffects]
      : [];
    pending.resumeEffects = [...innerResume, ...outerResume];
    return "pending";
  }
}
