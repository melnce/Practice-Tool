import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { TargetQuery, TargetingEnv } from "./types.js";
import { getBoard, getHand } from "../../../core/playerHelpers.js";
import {
  evaluateCardCondition,
  assertKnownCardConditionKeys,
  type CardCondition,
} from "../conditions/evaluator.js";
// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Keys handled in applyFilters before evaluateCardCondition (not card-intrinsic). */
const POOL_ONLY_CONDITION_KEYS = new Set(["not_self", "include_self"]);

function sharedPoolCondition(cond: Record<string, unknown>): CardCondition {
  const shared: CardCondition = {};
  for (const [key, value] of Object.entries(cond)) {
    if (POOL_ONLY_CONDITION_KEYS.has(key)) continue;
    if (value === undefined) continue;
    (shared as Record<string, unknown>)[key] = value;
  }
  assertKnownCardConditionKeys(
    shared as Record<string, unknown>,
    "applyFilters",
  );
  return shared;
}

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
  // Special contexts (last_summoned, entering_follower) must not exclude the
  // resolved card when sourceCard is that same instance (e.g. Congregant then-buff).
  const skipSelfExclusion =
    query.specialContext === "last_summoned" ||
    query.specialContext === "entering_follower";

  const forceExcludeSelf = query.excludeSelf === true;
  const allowSelf =
    skipSelfExclusion ||
    (!forceExcludeSelf &&
      (query.side === "self" ||
        cond.not_self === false ||
        cond.include_self === true));

  if (!allowSelf && env.sourceCard) {
    filtered = filtered.filter((c) => c?.uid !== env.sourceCard!.uid);
  }

  // Play preflight: the card being played is in no zone yet.
  const playingUid = env.context.playingCardUid;
  if (playingUid) {
    filtered = filtered.filter((c) => c?.uid !== playingUid);
  }

  // 3-9. Shared card-intrinsic conditions via unified evaluator
  const sharedCond = sharedPoolCondition(cond as Record<string, unknown>);
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

    const selectCount =
      typeof env.context.selectCount === "number" &&
      Number.isFinite(env.context.selectCount) &&
      env.context.selectCount > 0
        ? env.context.selectCount
        : 1;

    // Single-select: pool matches Taunt-only enemy targeting. Multi-select keeps
    // the full filtered pool; forced-first-pick handles Lloyd on pick 1 only.
    if (tauntCards.length > 0 && selectCount <= 1) {
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
