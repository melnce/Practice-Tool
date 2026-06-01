import type { CardInstance } from "../../../core/types/index.js";

/** Maximum defense this follower has had this game (full-health baseline). */
export function getMaxDefense(card: CardInstance): number {
  const current = parseInt(String(card.defense), 10) || 0;

  if (Number.isFinite(card.peak_defense)) {
    return Number(card.peak_defense);
  }
  if (Number.isFinite(card.potential_defense)) {
    return Number(card.potential_defense);
  }
  if (Number.isFinite(card.base_defense)) {
    const buffDef = Number(card.buffs?.defense ?? 0);
    return Number(card.base_defense) + buffDef;
  }

  // No baseline recorded — treat current as full health.
  return current;
}

/** True when current defense is below the recorded maximum (healed-to-full → false). */
export function isDamaged(card: CardInstance): boolean {
  const current = parseInt(String(card.defense), 10) || 0;
  return current < getMaxDefense(card);
}
