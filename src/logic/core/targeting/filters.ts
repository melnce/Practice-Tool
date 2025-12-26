import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types/index.js";
import { TargetQuery, TargetingEnv } from "./types.js";
import { getBoard, getHand } from "../../../core/playerHelpers.js";
import { evaluateCardCondition, CardCondition } from "../conditions/evaluator.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function getCardSide(c: CardInstance): Player | null {
  if (getBoard(state, "first")?.includes(c)) return "first";
  if (getBoard(state, "second")?.includes(c)) return "second";
  if (getHand(state, "first")?.includes(c)) return "first";
  if (getHand(state, "second")?.includes(c)) return "second";
  return c?.owner ?? null;
}

// -----------------------------------------------------------------------------
// Filter Pipeline
// -----------------------------------------------------------------------------

export function applyFilters(
  pool: CardInstance[],
  query: TargetQuery,
  env: TargetingEnv,
): CardInstance[] {
  const cond = query.condition || {};
  let filtered = pool;

  // 1. Initial Type Filter (from parser, e.g. "ally:follower")
  if (query.typeFilter === "follower")
    filtered = filtered.filter((c) => c?.type === "Follower");
  else if (query.typeFilter === "amulet")
    filtered = filtered.filter((c) => c?.type === "Amulet");
  else if (query.typeFilter === "spell")
    filtered = filtered.filter((c) => c?.type === "Spell");

  // 2. Self Exclusion
  // ally:X targets exclude self by default (standard Shadowverse behavior)
  // Self is only included when:
  //  - query.side is "self"
  //  - cond.include_self is true
  //  - cond.not_self is explicitly false
  const forceExcludeSelf = query.excludeSelf === true;
  const allowSelf =
    !forceExcludeSelf && (
      query.side === "self" ||
      cond.not_self === false ||
      cond.include_self === true
    );

  if (!allowSelf && env.sourceCard) {
    filtered = filtered.filter((c) => c?.uid !== env.sourceCard!.uid);
  }

  // 3-9. Use unified condition evaluator for shared conditions
  // Extract conditions that the evaluator handles
  const sharedCond: CardCondition = {};
  if (cond.type) sharedCond.type = cond.type;
  if (cond.tribe) sharedCond.tribe = cond.tribe;
  if (cond.has_keyword) sharedCond.has_keyword = cond.has_keyword;
  if (cond.exclude_keyword) sharedCond.exclude_keyword = cond.exclude_keyword;
  if (cond.unevolved) sharedCond.unevolved = cond.unevolved;
  if (cond.is_super_evolved) sharedCond.is_super_evolved = cond.is_super_evolved;
  if (cond.attack_lte != null) sharedCond.attack_lte = cond.attack_lte;
  if (cond.attack_gte != null) sharedCond.attack_gte = cond.attack_gte;
  if (cond.attack_eq != null) sharedCond.attack_eq = cond.attack_eq;
  if (cond.defense_lte != null) sharedCond.defense_lte = cond.defense_lte;
  if (cond.defense_gte != null) sharedCond.defense_gte = cond.defense_gte;
  if (cond.defense_eq != null) sharedCond.defense_eq = cond.defense_eq;
  if (cond.base_cost_eq != null) sharedCond.base_cost_eq = cond.base_cost_eq;
  if (cond.damaged != null) sharedCond.damaged = cond.damaged;
  if (cond.did_not_attack_this_turn) sharedCond.did_not_attack_this_turn = cond.did_not_attack_this_turn;

  // Apply shared conditions via unified evaluator
  if (Object.keys(sharedCond).length > 0) {
    filtered = filtered.filter((c) => evaluateCardCondition(c, sharedCond));
  }

  // 10. Ambush / Aura (Enemy Logic)
  // LEGACY: Ambush only protects against ENEMY targeted effects.
  // Self-targeting (buffs) or random effects (AOE) bypass this check.
  if (env.context.isTargetedEffect) {
    filtered = filtered.filter((c) => {
      const cardSide = getCardSide(c);
      const isEnemy = cardSide && cardSide !== env.owner;
      if (isEnemy && (c?.hasAmbush || (c as any).hasAura)) return false;
      return true;
    });
  }

  // 11. Taunt Enforcement (opponents must target Taunt cards first)
  // If targeting enemies and any have Taunt, ONLY Taunt cards are valid targets.
  if (env.context.isTargetedEffect) {
    const tauntCards = filtered.filter((c) => {
      const cardSide = getCardSide(c);
      const isEnemy = cardSide && cardSide !== env.owner;
      return isEnemy && (c as any).hasTaunt;
    });

    if (tauntCards.length > 0) {
      // Filter to only Taunt cards + any ally cards (Taunt only restricts enemy targeting)
      filtered = filtered.filter((c) => {
        const cardSide = getCardSide(c);
        const isEnemy = cardSide && cardSide !== env.owner;
        return !isEnemy || (c as any).hasTaunt;
      });
    }
  }

  // Note: damaged and did_not_attack_this_turn are now handled by evaluateCardCondition

  return filtered;
}















