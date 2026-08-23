import type { CardInstance, Effect } from "../../core/types/index.js";

/**
 * Discard-trigger effects come only from `on_discard`.
 * Spell/fanfare arrays are play-only and must never fire on discard.
 */
export function getDiscardTriggerEffects(card: CardInstance): Effect[] {
  const fx = (card as { on_discard?: Effect[] }).on_discard;
  if (!Array.isArray(fx) || !fx.length) return [];
  return fx;
}

/**
 * Queue discarded-card triggers onto resumeEffects (LIFO per card, reverse per effect).
 */
export function queueDiscardTriggerEffects(
  discarded: CardInstance[],
  resumeEffects: Effect[],
): void {
  for (const dc of discarded) {
    const fx = getDiscardTriggerEffects(dc);
    if (!fx.length) continue;
    for (let i = fx.length - 1; i >= 0; i--) {
      resumeEffects.unshift(fx[i]!);
    }
  }
}
