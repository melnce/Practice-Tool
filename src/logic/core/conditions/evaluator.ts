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
import {
  getEffectivePlayCost,
  isPlayCostChangedFromPrinted,
} from "../../../helpers/alternateForm.js";
import { hasKeyword, hasAllKeywords } from "../keywords/has.js";
import { readEnv } from "../../../core/env.js";

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

  // Cost filters (printed base cost)
  base_cost_eq?: number;
  base_cost_gte?: number;
  base_cost_lte?: number;
  /** Current play cost (may differ from printed after buffs). */
  cost_eq?: number;
  cost_gte?: number;
  cost_lte?: number;
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

  // Name filter
  name?: string;

  /** Match a specific card instance by uid (test/harness use). */
  uid?: string;
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

/**
 * Keys understood by evaluateCardCondition. Used by applyFilters and op-keys-gate.
 */
export const CARD_CONDITION_KEYS = new Set([
  "type",
  "class",
  "tribe",
  "exclude_tribe",
  "has_keyword",
  "keywords",
  "exclude_keyword",
  "attack_lte",
  "attack_gte",
  "attack_eq",
  "defense_lte",
  "defense_gte",
  "defense_eq",
  "base_cost_eq",
  "base_cost_gte",
  "base_cost_lte",
  "base_cost_in",
  "cost_eq",
  "cost_gte",
  "cost_lte",
  "cost_in",
  "cost_changed",
  "unevolved",
  "is_super_evolved",
  "damaged",
  "did_not_attack_this_turn",
  "name",
  "uid",
]);

const warnedCardConditionKeys = new Set<string>();

function nearestCardConditionKey(
  unknown: string,
  allowed: Iterable<string>,
): string {
  const list = [...allowed];
  if (!list.length) return "(none)";
  let best = list[0]!;
  let bestScore = Infinity;
  for (const k of list) {
    const a = unknown.toLowerCase();
    const b = k.toLowerCase();
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0),
    );
    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + cost,
        );
      }
    }
    const score = dp[m]![n]!;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/**
 * Fail loudly on unknown condition keys (test throw, otherwise warn-once).
 * Pool evaluation runs on live game state in the owner's browser — never throw there.
 */
export function assertKnownCardConditionKeys(
  cond: Record<string, unknown>,
  context = "evaluateCardCondition",
): void {
  for (const key of Object.keys(cond)) {
    if (CARD_CONDITION_KEYS.has(key)) continue;
    const nearest = nearestCardConditionKey(key, CARD_CONDITION_KEYS);
    const msg = `Unknown card condition key "${key}" in ${context} (try "${nearest}")`;
    if (readEnv("NODE_ENV") === "test") {
      throw new Error(msg);
    }
    if (!warnedCardConditionKeys.has(key)) {
      console.warn(msg);
      warnedCardConditionKeys.add(key);
    }
  }
}

function getCurrentCost(card: CardInstance): number {
  const n = parseInt(String(card.cost), 10);
  return Number.isFinite(n) ? n : 0;
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

  // Class filter (case-insensitive — card data may author lowercase on filters)
  if (cond.class) {
    const want = String(cond.class).toLowerCase();
    const have = String(card.class || "").toLowerCase();
    if (have !== want) return false;
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

  // Current cost filter (distinct from base_cost_* — honors temporary reductions)
  if (cond.cost_eq != null) {
    const lim = toNum(cond.cost_eq);
    if (lim != null && getCurrentCost(card) !== lim) return false;
  }
  if (cond.cost_gte != null) {
    const lim = toNum(cond.cost_gte);
    if (lim != null && getCurrentCost(card) < lim) return false;
  }
  if (cond.cost_lte != null) {
    const lim = toNum(cond.cost_lte);
    if (lim != null && getCurrentCost(card) > lim) return false;
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

  // Cost changed — net effective play cost vs printed base (Institute of Truth Q&A).
  if (cond.cost_changed) {
    if (!isPlayCostChangedFromPrinted(card)) return false;
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

  // Name filter
  if (cond.name) {
    if (String(card.name) !== String(cond.name)) return false;
  }

  // Instance uid filter
  if (cond.uid) {
    if (String(card.uid) !== String(cond.uid)) return false;
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
