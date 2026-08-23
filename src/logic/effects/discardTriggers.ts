import type { CardInstance, Effect, Player } from "../../core/types/index.js";

/** Metadata keys for discard-trigger effects queued onto resumeEffects. */
export const DISCARD_CONTROLLER_KEY = "_discardController";
export const DISCARD_SOURCE_UID_KEY = "_discardSourceUid";

/**
 * Discard-trigger effects come only from `on_discard`.
 * Spell/fanfare arrays are play-only and must never fire on discard.
 */
export function getDiscardTriggerEffects(card: CardInstance): Effect[] {
  const fx = (card as { on_discard?: Effect[] }).on_discard;
  if (!Array.isArray(fx) || !fx.length) return [];
  return fx;
}

function annotateDiscardEffect(
  effect: Effect,
  controller: Player,
  sourceUid: string,
): Effect {
  return {
    ...effect,
    [DISCARD_CONTROLLER_KEY]: controller,
    [DISCARD_SOURCE_UID_KEY]: sourceUid,
  };
}

/**
 * Queue discarded-card triggers onto resumeEffects (LIFO per card, reverse per effect).
 * Each effect carries the discarded card's controller + uid for runEffects routing.
 */
export function queueDiscardTriggerEffects(
  discarded: CardInstance[],
  resumeEffects: Effect[],
): void {
  for (const dc of discarded) {
    const fx = getDiscardTriggerEffects(dc);
    if (!fx.length) continue;
    const controller: Player = dc.owner === "second" ? "second" : "first";
    for (let i = fx.length - 1; i >= 0; i--) {
      resumeEffects.unshift(annotateDiscardEffect(fx[i]!, controller, dc.uid));
    }
  }
}
