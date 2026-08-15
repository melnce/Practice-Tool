// src/logic/effects/ops/damage/unified.ts
// Unified damage handler - thin router delegating to helpers and primitives

import { getPool } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { applyLeaderDamage } from "../../leader.js";
import { dealDamage } from "../../../core/barrier.js";
import type {
  Effect,
  CardInstance,
  Player,
} from "../../../../core/types/index.js";
import { opponentOf, getHP, getMaxHP } from "../../../../core/playerHelpers.js";
import { resolveUids } from "../../../../core/uidResolver.js";

import type { UnifiedDamageSpec, DamageContext } from "./types.js";

import { normalizeToUnifiedSpec } from "./types.js";
import {
  applyDirectDamage,
  applyRandomHits,
  applySplitSpillover,
} from "./primitives.js";
import {
  resolveAmount,
  handleSelection,
  handleByStatDamage,
} from "./helpers.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified damage handler.
 * Accepts canonical fields OR legacy format and routes through primitives.
 *
 * Returns:
 * - "pending" if waiting for user selection
 * - "done" or undefined otherwise
 */
export function handleDamage(
  eff: Effect & Record<string, any>,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: DamageContext = { owner, sourceCard },
): "pending" | "done" | void {
  // Normalize to canonical spec
  const spec = normalizeToUnifiedSpec(eff);

  // Merge context (context values take precedence)
  const ctx: DamageContext = {
    ...context,
    owner,
    sourceCard,
    effectsQueue,
  };

  // Resolve amount
  const amount = resolveAmount(spec, ctx);
  if (amount <= 0 && spec.distribution !== "by_stat") {
    return "done";
  }

  // Special case: defender targeting (Follower Strike)
  if (spec.target === "defender" && ctx.defender) {
    dealDamage(ctx.defender, amount);
    cleanupDead();
    return "done";
  }

  // Special case: clash_opponent targeting (Clash triggers)
  if (spec.target === "clash_opponent" && sourceCard) {
    const opponent =
      sourceCard.uid === ctx.attacker?.uid
        ? ctx.defender
        : sourceCard.uid === ctx.defender?.uid
          ? ctx.attacker
          : null;
    if (opponent) {
      dealDamage(opponent, amount);
      cleanupDead();
      return "done";
    }
  }

  // Special case: self targeting
  if (spec.target === "self" && sourceCard) {
    if (sourceCard.type === "Follower") {
      dealDamage(sourceCard, amount);
      cleanupDead();
    }
    return "done";
  }

  // Special case: explicit targets from context
  if (ctx.targets && ctx.targets.length > 0 && !spec.select) {
    applyDirectDamage(amount, ctx.targets, "damage");
    return "done";
  }

  // Post-selection follower damage (e.g. Maximum Love Bomb nested effects)
  const targetStr = String(spec.target || "").toLowerCase();
  if (targetStr.startsWith("selected")) {
    const uids = ctx.targetUids;
    if (uids?.length) {
      const targets = resolveUids(uids).filter((c) => c?.type === "Follower");
      if (targets.length) {
        applyDirectDamage(amount, targets, "damage");
        cleanupDead();
      }
      return "done";
    }
  }

  // by_stat must run before generic leader routing (e.g. Raging Lightning Overflow)
  if (spec.distribution === "by_stat") {
    handleByStatDamage(spec, amount, owner);
    return "done";
  }

  // Leader targeting
  if (targetStr.includes("leader")) {
    const isEnemy = String(spec.target || "").includes("enemy");
    const targetPlayer = isEnemy ? opponentOf(owner) : owner;
    applyLeaderDamage(targetPlayer, amount);
    return "done";
  }

  // Resolve recipient pool
  // isTargetedEffect should only be true when player selects targets (spec.select > 0)
  // AoE/random effects should bypass Ambush protection
  const isSelectBased = spec.select != null && spec.select > 0;
  const pool = getPool(spec.target || "", owner, sourceCard, spec.condition, {
    isTargetedEffect: isSelectBased,
  }).filter((c) => c != null && c.type === "Follower");

  // Handle selection requirement
  if (spec.select && spec.select > 0) {
    return handleSelection(
      eff,
      spec,
      pool,
      amount,
      owner,
      sourceCard,
      effectsQueue,
    );
  }

  // Dispatch by distribution mode
  // Note: "by_stat" is handled above (early return) before this switch.
  switch (spec.distribution) {
    case "random":
    case "random_hits":
      applyRandomHits(spec.count || 1, amount, spec.target || "", owner, {
        includeLeader: spec.include_leader ?? false,
        sourceCard,
      });
      break;

    case "split_sequential":
      applySplitSpillover(amount, pool, owner, {
        spillToLeader: spec.spill_to_leader ?? false,
      });
      break;

    case "direct":
    default: {
      applyDirectDamage(amount, pool, "damage");
      // For "enemy:any" or "all" distribution, also damage the enemy leader
      const targetStr = String(spec.target || "").toLowerCase();
      if (targetStr.includes("enemy") && targetStr.includes("any")) {
        applyLeaderDamage(opponentOf(owner), amount);
      }
      break;
    }
  }

  return "done";
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { normalizeToUnifiedSpec, UnifiedDamageSpec } from "./types.js";
