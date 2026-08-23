// src/logic/effects/ops/damage/primitives.ts
// Shared primitives for damage operations.
// These are internal implementation details - legacy ops remain as thin wrappers.

import { dealDamage, withDamageBatch } from "../../../core/barrier.js";
import { state } from "../../../../core/gameState.js";
import { getPool } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { applyLeaderDamage } from "../../leader.js";
import type {
  Effect,
  CardInstance,
  Player,
  DamageEffect,
} from "../../../../core/types/index.js";
import { resolveAmountWithOverflow } from "./calculator.js";
import type { DamageContext } from "./types.js";
import {
  getHand,
  getBoard,
  getCrests,
  opponentOf,
} from "../../../../core/playerHelpers.js";

// ============================================================================
// TYPES (re-export for convenience, additional types only)
// ============================================================================

export type { DamageContext } from "./types.js";

export interface SplitSpilloverRules {
  /** If true, remaining damage after followers die goes to leader */
  spillToLeader?: boolean;
  /** Custom amount resolver - if not provided, uses eff.amount */
  amountOverride?: number;
}

// ============================================================================
// RECIPIENT RESOLUTION
// ============================================================================

/**
 * Resolves damage recipients, preferring explicit targets from selection context.
 * DESIGN: Selection is externalized - this just reads from context or resolves from target spec.
 */
export function resolveDamageRecipients(
  eff: Effect,
  ctx: DamageContext,
): CardInstance[] {
  const dEff = eff as DamageEffect;

  // Priority 1: Explicit targets from selection context
  if (ctx.targets && ctx.targets.length > 0) {
    return ctx.targets;
  }

  // Priority 2: Defender context (for follower strike)
  if ((dEff.target as string) === "defender" && ctx.defender) {
    return [ctx.defender];
  }

  // Priority 3: Resolve from target specification
  const targetSpec = (dEff.target as string) || "";
  return getPool(
    targetSpec,
    ctx.owner,
    ctx.sourceCard || null,
    dEff.condition,
  ).filter((c) => c.type === "Follower");
}

// ============================================================================
// AMOUNT RESOLUTION (EXTENDED)
// ============================================================================

export type AmountSource =
  | "fixed" // From JSON amount field
  | "hand_size" // Current hand size
  | "selected_defense" // DEF of selected card
  | "golem_count" // Allied golem count
  | "other_allies" // Count of other allies
  | "crest_count"; // Crest count

/**
 * Resolves damage amount from various sources.
 * Extends resolveAmountWithOverflow with dynamic sources.
 */
export function resolveDamageAmountExtended(
  eff: Effect,
  ctx: DamageContext,
  source: AmountSource = "fixed",
): number {
  const { owner, sourceCard, selectedCard } = ctx;

  switch (source) {
    case "hand_size": {
      const hand = getHand(state, owner);
      return hand.length;
    }

    case "selected_defense": {
      const sel = selectedCard || (state as any).__lastSelected || null;
      return parseInt(String(sel?.defense ?? 0), 10) || 0;
    }

    case "golem_count": {
      const board = getBoard(state, owner);
      return board.filter(
        (c) =>
          c.type === "Follower" &&
          ((Array.isArray(c.tribes) && c.tribes.includes("Golem")) ||
            /golem/i.test(c.name)),
      ).length;
    }

    case "other_allies": {
      const board = getBoard(state, owner);
      // Exclude source card if present
      return board.filter(
        (c) =>
          c.type === "Follower" && (!sourceCard || c.uid !== sourceCard.uid),
      ).length;
    }

    case "crest_count": {
      const list = getCrests(state, owner);
      return Array.isArray(list) ? list.length : 0;
    }

    case "fixed":
    default:
      return resolveAmountWithOverflow(eff, owner, { sourceCard });
  }
}

// ============================================================================
// DAMAGE APPLICATION PRIMITIVES
// ============================================================================

/**
 * Apply damage directly to all recipients.
 * Simple loop - no randomness, no spillover.
 */
export function applyDirectDamage(
  amount: number,
  recipients: CardInstance[],
  logTag: string = "damage",
): void {
  withDamageBatch(() => {
    for (const target of recipients) {
      if (target.type === "Follower") {
        logEvent(logTag, { target: target.name, uid: target.uid, amount });
        dealDamage(target, amount);
      }
    }
  });
}

/**
 * Apply damage to random distinct targets N times.
 * SEMANTICS (rulebook sequential random):
 * - Pool is rebuilt each hit (accounts for deaths mid-sequence)
 * - Same target CANNOT be hit twice (without replacement among living targets)
 * - If fewer valid targets remain than hits left, extra hits do nothing
 * - Can include leader(s) if target spec / includeLeader allows (each leader at most once)
 */
export function applyRandomDistinctHits(
  hitCount: number,
  amountPerHit: number,
  targetSpec: string,
  owner: Player,
  options?: {
    includeLeader?: boolean | "enemy" | "ally" | "both";
    sourceCard?: CardInstance | null;
  },
): void {
  const includeLeaderOpt = options?.includeLeader;
  const includeLeader =
    includeLeaderOpt === true ||
    includeLeaderOpt === "enemy" ||
    includeLeaderOpt === "ally" ||
    includeLeaderOpt === "both" ||
    (includeLeaderOpt == null &&
      (targetSpec === "enemy" ||
        targetSpec === "enemy:all" ||
        targetSpec === "all"));

  const leaderMode: "enemy" | "ally" | "both" | false =
    includeLeaderOpt === "both" || includeLeaderOpt === "ally"
      ? includeLeaderOpt
      : includeLeader
        ? "enemy"
        : false;

  const pickedFollowerUids = new Set<string>();
  const pickedLeaders = new Set<Player>();

  withDamageBatch(() => {
    let remaining = hitCount;
    while (remaining-- > 0) {
      const pool: (
        | CardInstance
        | { type: "Leader"; owner: Player; name: string }
      )[] = [...getPool(targetSpec, owner, options?.sourceCard ?? null)];

      if (leaderMode === "enemy" || leaderMode === "both") {
        const targetOwner = opponentOf(owner);
        if (!pickedLeaders.has(targetOwner)) {
          pool.push({
            type: "Leader",
            owner: targetOwner,
            name: "Enemy Leader",
          } as any);
        }
      }
      if (leaderMode === "ally" || leaderMode === "both") {
        if (!pickedLeaders.has(owner)) {
          pool.push({
            type: "Leader",
            owner,
            name: "Allied Leader",
          } as any);
        }
      }

      const valid = pool.filter((c) => {
        if (!c) return false;
        if (c.type === "Leader") return true;
        if (c.type === "Follower") {
          const card = c as CardInstance;
          if (pickedFollowerUids.has(card.uid)) return false;
          return (parseInt(String(card.defense), 10) || 0) > 0;
        }
        return false;
      });
      if (!valid.length) break;

      const pick = valid[state.rng.nextInt(valid.length)];
      if (!pick) break;

      logEvent("damageRandomDistinct", {
        target: (pick as any).name,
        uid: (pick as any).uid,
        amount: amountPerHit,
      });

      if (pick.type === "Leader") {
        const leaderOwner = (pick as any).owner as Player;
        pickedLeaders.add(leaderOwner);
        applyLeaderDamage(leaderOwner, amountPerHit);
      } else {
        const card = pick as CardInstance;
        pickedFollowerUids.add(card.uid);
        dealDamage(card, amountPerHit);
      }
    }
  });
}

/**
 * Apply damage to random targets N times.
 * SEMANTICS (preserved from legacy):
 * - Pool is rebuilt each hit (accounts for deaths mid-sequence)
 * - Same target CAN be hit multiple times (with replacement)
 * - Can include leader(s) if target spec / includeLeader allows
 */
export function applyRandomHits(
  hitCount: number,
  amountPerHit: number,
  targetSpec: string,
  owner: Player,
  options?: {
    includeLeader?: boolean | "enemy" | "ally" | "both";
    sourceCard?: CardInstance | null;
  },
): void {
  const includeLeaderOpt = options?.includeLeader;
  const includeLeader =
    includeLeaderOpt === true ||
    includeLeaderOpt === "enemy" ||
    includeLeaderOpt === "ally" ||
    includeLeaderOpt === "both" ||
    (includeLeaderOpt == null &&
      (targetSpec === "enemy" ||
        targetSpec === "enemy:all" ||
        targetSpec === "all"));

  const leaderMode: "enemy" | "ally" | "both" | false =
    includeLeaderOpt === "both" || includeLeaderOpt === "ally"
      ? includeLeaderOpt
      : includeLeader
        ? "enemy"
        : false;

  withDamageBatch(() => {
    let remaining = hitCount;
    while (remaining-- > 0) {
      // Rebuild pool each hit
      const pool: (
        | CardInstance
        | { type: "Leader"; owner: Player; name: string }
      )[] = [...getPool(targetSpec, owner, options?.sourceCard ?? null)];

      if (leaderMode === "enemy" || leaderMode === "both") {
        const targetOwner = opponentOf(owner);
        pool.push({
          type: "Leader",
          owner: targetOwner,
          name: "Enemy Leader",
        } as any);
      }
      if (leaderMode === "ally" || leaderMode === "both") {
        pool.push({
          type: "Leader",
          owner,
          name: "Allied Leader",
        } as any);
      }

      const valid = pool.filter((c) => {
        if (!c) return false;
        if (c.type === "Leader") return true;
        if (c.type === "Follower") {
          return (parseInt(String((c as CardInstance).defense), 10) || 0) > 0;
        }
        return false;
      });
      if (!valid.length) break;

      const pick = valid[state.rng.nextInt(valid.length)];
      if (!pick) break;

      logEvent("damageRandom", {
        target: (pick as any).name,
        uid: (pick as any).uid,
        amount: amountPerHit,
      });

      if (pick.type === "Leader") {
        applyLeaderDamage((pick as any).owner, amountPerHit);
      } else {
        dealDamage(pick as CardInstance, amountPerHit);
      }
    }
  });
}

/**
 * Apply damage split sequentially with spillover.
 * SEMANTICS (preserved from legacy):
 * - Damage is dealt to first target until destroyed, then spills to next
 * - Each target absorbs min(remaining, currentDefense)
 * - Ordering: targets in pool order (oldest to newest on board)
 * - If spillToLeader is true, remaining damage after all followers goes to leader
 */
export function applySplitSpillover(
  totalAmount: number,
  recipients: CardInstance[],
  owner: Player,
  rules?: SplitSpilloverRules,
): void {
  if (totalAmount <= 0) return;
  if (!recipients.length && !rules?.spillToLeader) return;

  let remaining = totalAmount;

  // Apply to followers in order
  for (const target of recipients) {
    if (remaining <= 0) break;

    const curDef = parseInt(String(target.defense), 10) || 0;
    if (curDef <= 0) continue;

    const dmg = Math.min(remaining, curDef);
    if (dmg > 0) {
      dealDamage(target, dmg);
      remaining -= dmg;
    }
  }

  // Spill to leader if enabled
  if (remaining > 0 && rules?.spillToLeader) {
    const enemy = opponentOf(owner);
    applyLeaderDamage(enemy, remaining);
  }

  logEvent("damageSplitDone", {
    mode: rules?.spillToLeader ? "allEnemies" : "sequential",
    leftover: remaining,
  });
  cleanupDead();
}
