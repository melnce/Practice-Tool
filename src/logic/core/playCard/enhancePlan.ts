/**
 * Shared Enhance play-path decision: additive by default, replace only when
 * the card opts in with `enhance_replaces_base`.
 *
 * Each play path (follower / spell / amulet) keeps its own ordering machinery;
 * only the *which lists run* decision is shared here.
 */
import type { CardInstance, Effect } from "../../../core/types/index.js";

/**
 * True when at least one chosen Enhance tier carries effects **and** the card
 * sets `enhance_replaces_base === true`. In that case only the tier effects
 * run; otherwise base effects run and then the tiers (additive).
 */
export function enhanceReplacesBase(
  card: CardInstance,
  tiers: { effects: Effect[] }[],
): boolean {
  const hasTierWithEffects = tiers.some(
    (tier) => Array.isArray(tier.effects) && tier.effects.length > 0,
  );
  return hasTierWithEffects && (card as any).enhance_replaces_base === true;
}
