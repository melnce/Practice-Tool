/**
 * Unified Condition Evaluator
 *
 * CHOKE POINT: All card condition evaluation should use this module.
 * This consolidates condition checking logic previously duplicated between:
 * - triggers/conditions.ts (evalCommonConditions)
 * - targeting/filters.ts (applyFilters)
 *
 * @module conditions/evaluator
 */

import type { CardInstance } from "../../../core/types/index.js";
import { hasKeyword, hasAllKeywords } from "../keywords/has.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Condition specification that can be applied to a card.
 * This is a subset of effect conditions that are purely card-intrinsic.
 */
export interface CardCondition {
  // Type filters
  type?: string;

  // Class filter (e.g. Abysscraft)
  class?: string;

  // Tribe filter
  tribe?: string;
  /** Fail if the card has this tribe (case-insensitive). */
  exclude_tribe?: string;

  // Keyword filters
  has_keyword?: string | string[];
  keywords?: string | string[];
  exclude_keyword?: string;

  // Stat comparisons (for the card being checked)
  attack_lte?: number;
  attack_gte?: number;
  attack_eq?: number;
  defense_lte?: number;
  defense_gte?: number;
  defense_eq?: number;

  // Cost filters
  base_cost_eq?: number;
  base_cost_gte?: number;
  base_cost_lte?: number;
  /** Match if base cost is one of these values. */
  base_cost_in?: number[];
  /** Match if current cost is one of these values. */
  cost_in?: number[];
  cost_changed?: boolean;

  // Evolution state
  unevolved?: boolean;
  is_super_evolved?: boolean;

  // Combat state
  damaged?: boolean;
  did_not_attack_this_turn?: boolean;
  still_alive?: boolean;

  // Name filter
  name?: string;
}

/**
 * Context for condition evaluation.
 */
export interface ConditionContext {
  /** The card we're comparing against (for is_self, not_self) */
  sourceCard?: CardInstance | null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const toNum = (v: any): number | null =>
  Number.isFinite(Number(v)) ? Number(v) : null;

function getAttack(card: CardInstance): number {
  return parseInt(card?.attack as string, 10) || 0;
}

function getDefense(card: CardInstance): number {
  return parseInt(card?.defense as string, 10) || 0;
}

function getBaseCost(card: CardInstance): number {
  return card.base_cost !== undefined
    ? Number(card.base_cost)
    : parseInt(card.cost as any) || 0;
}

function isCardDamaged(card: CardInstance): boolean {
  const curr = getDefense(card);
  const full = Number.isFinite(card?.potential_defense)
    ? (card.potential_defense as number)
    : Number.isFinite(card?.peak_defense)
      ? (card.peak_defense as number)
      : Number.isFinite(card?.base_defense)
        ? (card.base_defense as number)
        : curr;
  return curr < full;
}

// -----------------------------------------------------------------------------
// Core Evaluator
// -----------------------------------------------------------------------------

/**
 * Evaluate if a card satisfies a condition.
 *
 * @param card - The card to evaluate
 * @param cond - The condition to check
 * @param ctx - Optional context (for self-comparison, etc.)
 * @returns true if the card satisfies all conditions
 */
export function evaluateCardCondition(
  card: CardInstance | null | undefined,
  cond: CardCondition,
  _ctx: ConditionContext = {},
): boolean {
  if (!card) return false;

  // Type filter
  if (cond.type) {
    const want = String(cond.type).toLowerCase();
    const have = String(card.type || "").toLowerCase();
    if (have !== want) return false;
  }

  // Class filter
  if (cond.class) {
    if (String(card.class || "") !== String(cond.class)) return false;
  }

  // Tribe filter
  if (cond.tribe) {
    const want = String(cond.tribe).toLowerCase();
    const tribes = Array.isArray(card.tribes)
      ? card.tribes.map((t) => String(t).toLowerCase())
      : [];
    if (!tribes.includes(want)) return false;
  }

  // Exclude tribe
  if (cond.exclude_tribe) {
    const want = String(cond.exclude_tribe).toLowerCase();
    const tribes = Array.isArray(card.tribes)
      ? card.tribes.map((t) => String(t).toLowerCase())
      : [];
    if (tribes.includes(want)) return false;
  }

  // Keyword filters (has_keyword or keywords)
  const wantKeywords = cond.has_keyword ?? cond.keywords;
  if (wantKeywords) {
    const wants = Array.isArray(wantKeywords) ? wantKeywords : [wantKeywords];
    const filtered = wants.filter((s): s is string => typeof s === "string");
    if (!hasAllKeywords(card, filtered)) return false;
  }

  // Exclude keyword
  if (cond.exclude_keyword) {
    if (hasKeyword(card, cond.exclude_keyword)) return false;
  }

  // Stat comparisons
  const atk = getAttack(card);
  const def = getDefense(card);

  if (cond.attack_lte != null) {
    const lim = toNum(cond.attack_lte);
    if (lim != null && atk > lim) return false;
  }
  if (cond.attack_gte != null) {
    const lim = toNum(cond.attack_gte);
    if (lim != null && atk < lim) return false;
  }
  if (cond.attack_eq != null) {
    const lim = toNum(cond.attack_eq);
    if (lim != null && atk !== lim) return false;
  }
  if (cond.defense_lte != null) {
    const lim = toNum(cond.defense_lte);
    if (lim != null && def > lim) return false;
  }
  if (cond.defense_gte != null) {
    const lim = toNum(cond.defense_gte);
    if (lim != null && def < lim) return false;
  }
  if (cond.defense_eq != null) {
    const lim = toNum(cond.defense_eq);
    if (lim != null && def !== lim) return false;
  }

  // Base cost filter
  if (cond.base_cost_eq != null) {
    const lim = toNum(cond.base_cost_eq);
    if (lim != null && getBaseCost(card) !== lim) return false;
  }
  if (cond.base_cost_gte != null) {
    const lim = toNum(cond.base_cost_gte);
    if (lim != null && getBaseCost(card) < lim) return false;
  }
  if (cond.base_cost_lte != null) {
    const lim = toNum(cond.base_cost_lte);
    if (lim != null && getBaseCost(card) > lim) return false;
  }
  if (Array.isArray(cond.base_cost_in) && cond.base_cost_in.length) {
    const base = getBaseCost(card);
    const allowed = cond.base_cost_in
      .map((n) => toNum(n))
      .filter((n): n is number => n != null);
    if (!allowed.includes(base)) return false;
  }
  if (Array.isArray(cond.cost_in) && cond.cost_in.length) {
    const cost = parseInt(String(card.cost), 10) || 0;
    const allowed = cond.cost_in
      .map((n) => toNum(n))
      .filter((n): n is number => n != null);
    if (!allowed.includes(cost)) return false;
  }

  // Cost changed
  if (cond.cost_changed) {
    const printed = Number.isFinite((card as any).base_cost)
      ? Number((card as any).base_cost)
      : Number(card.cost) || 0;
    const current = Number(card.cost) || 0;
    const handMod = Number((card as any).cost_mod) || 0;
    const changed =
      handMod !== 0 ||
      (Number.isFinite((card as any).base_cost) && current !== printed);
    if (!changed) return false;
  }

  // Evolution state
  if (cond.unevolved && card.hasEvolved) return false;

  if (cond.is_super_evolved) {
    if (card.type !== "Follower" || card.evoType !== "super") return false;
  }

  // Combat state - damaged
  if (cond.damaged === true) {
    if (card.type !== "Follower" || !isCardDamaged(card)) return false;
  } else if (cond.damaged === false) {
    if (card.type !== "Follower" || isCardDamaged(card)) return false;
  }

  // Did not attack this turn
  if (cond.did_not_attack_this_turn) {
    if (card.type !== "Follower") return false;
    if ((card as any).attacks_used_this_turn || card.hasAttacked) return false;
  }

  // Still alive
  if (cond.still_alive === true && def <= 0) return false;

  // Name filter
  if (cond.name) {
    if (String(card.name) !== String(cond.name)) return false;
  }

  return true;
}

/**
 * Filter an array of cards by a condition.
 *
 * @param cards - Cards to filter
 * @param cond - Condition to apply
 * @param ctx - Optional context
 * @returns Cards that satisfy the condition
 */
export function filterByCondition(
  cards: CardInstance[],
  cond: CardCondition,
  _ctx: ConditionContext = {},
): CardInstance[] {
  return cards.filter((c) => evaluateCardCondition(c, cond, _ctx));
}
