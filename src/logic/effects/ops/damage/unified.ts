// src/logic/effects/ops/damage/unified.ts
// Unified damage handler - routes through normalized spec to primitives.

import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { applyLeaderDamage } from "../../leader.js";
import { dealDamage } from "../../../core/barrier.js";
import { Effect, CardInstance, Player } from "../../../../core/types.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import { getBoard, getHP, opponentOf } from "../../../../core/playerHelpers.js";

import {
  UnifiedDamageSpec,
  DamageContext,
  normalizeToUnifiedSpec,
} from "./types.js";
import {
  resolveAmountWithOverflow,
  applyDirectDamage,
  applyRandomHits,
  applySplitSpillover,
  resolveDamageAmountExtended,
} from "./index.js";

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
  // Targets whoever is opposing the source card in combat
  if (spec.target === "clash_opponent" && sourceCard) {
    const opponent =
      sourceCard.uid === ctx.attacker?.uid ? ctx.defender :
        sourceCard.uid === ctx.defender?.uid ? ctx.attacker :
          null;
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

  // Leader targeting
  if (String(spec.target || "").includes("leader")) {
    const isEnemy = String(spec.target || "").includes("enemy");
    const targetPlayer = isEnemy ? opponentOf(owner) : owner;
    applyLeaderDamage(targetPlayer, amount);
    return "done";
  }

  // Resolve recipient pool
  const pool = getPool(spec.target || "", owner, sourceCard, spec.condition, {
    isTargetedEffect: true,
  }).filter((c) => c.type === "Follower");

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
  switch (spec.distribution) {
    case "random_hits":
      applyRandomHits(spec.count || 1, amount, spec.target || "", owner, {
        includeLeader: spec.include_leader ?? false,
      });
      break;

    case "split_sequential":
      applySplitSpillover(amount, pool, owner, {
        spillToLeader: spec.spill_to_leader ?? false,
      });
      break;

    case "by_stat":
      handleByStatDamage(spec, amount, owner);
      break;

    case "direct":
    default:
      applyDirectDamage(amount, pool, "damage");
      break;
  }

  return "done";
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function resolveAmount(spec: UnifiedDamageSpec, ctx: DamageContext): number {
  const source = spec.amount_source as string;

  // Handle context.* pattern - read from ctx.variables
  if (source && source.startsWith("context.")) {
    const varName = source.substring(8); // Remove "context." prefix
    const value = (ctx as any).variables?.[varName];
    if (value === undefined) {
      console.warn(
        `[Context] Variable '${varName}' not found, defaulting to 0`,
      );
      return 0;
    }
    return typeof value === "number" ? value : Number(value) || 0;
  }

  switch (spec.amount_source) {
    case "hand_size":
      return resolveDamageAmountExtended({} as Effect, ctx, "hand_size");
    case "selected_defense":
      return resolveDamageAmountExtended({} as Effect, ctx, "selected_defense");
    case "golem_count":
      return resolveDamageAmountExtended({} as Effect, ctx, "golem_count");
    case "crest_count":
      return resolveDamageAmountExtended({} as Effect, ctx, "crest_count");
    case "other_allies":
      return resolveDamageAmountExtended({} as Effect, ctx, "other_allies");
    case "fixed":
    default:
      // Use amount field, with overflow support
      return resolveAmountWithOverflow(
        { amount: spec.amount } as any,
        ctx.owner,
        { sourceCard: ctx.sourceCard },
      );
  }
}

function handleSelection(
  eff: Effect,
  spec: UnifiedDamageSpec,
  pool: CardInstance[],
  amount: number,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
): "pending" | "done" {
  const selectCount = Math.min(spec.select || 1, pool.length);

  if (selectCount === 0 && !spec.fallback_leader) {
    return "done";
  }

  setPendingTarget({
    eff: { ...eff, amount } as any,
    owner,
    sourceCard,
    targets: [],
    selectCount: selectCount || 1,
    pool,
    resumeEffects: effectsQueue,
    canTargetLeader: spec.fallback_leader ?? false,
  });

  logEvent("damage_select", {
    owner,
    pool: pool.length,
    select: selectCount,
    amount,
  });

  if (pool.length) {
    highlightSelectable(pool);
  } else {
    // Render removed - UI layer
  }

  return "pending";
}

function handleByStatDamage(
  spec: UnifiedDamageSpec,
  amount: number,
  _owner: Player,
): void {
  const stat = spec.stat || "defense";
  const targetType = spec.target || "follower";

  if (
    targetType === "follower" ||
    targetType === "enemy:follower" ||
    targetType === "all:follower"
  ) {
    const allFollowers = [
      ...getBoard(state, "first"),
      ...getBoard(state, "second"),
    ].filter((c) => c && c.type === "Follower");
    if (!allFollowers.length) return;

    const getValue = (c: CardInstance) =>
      parseInt(String(stat === "defense" ? c.defense : c.attack), 10) || 0;
    const maxVal = Math.max(...allFollowers.map(getValue));
    const targets = allFollowers.filter((c) => getValue(c) === maxVal);

    for (const t of targets) {
      dealDamage(t, amount);
    }
    cleanupDead();
    return;
  }

  if (targetType === "leader") {
    const blueHP = getHP(state, "first");
    const redHP = getHP(state, "second");
    const enemy = blueHP >= redHP ? "first" : "second";
    applyLeaderDamage(enemy, amount);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { normalizeToUnifiedSpec, UnifiedDamageSpec } from "./types.js";















