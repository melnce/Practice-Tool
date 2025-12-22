// src/logic/effects/ops/damage/primitives.ts
// Shared primitives for damage operations.
// These are internal implementation details - legacy ops remain as thin wrappers.

import { dealDamage } from "../../../core/barrier.js";
import { state } from "../../../../core/gameState.js";
import { getPool } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { applyLeaderDamage } from "../../leader.js";
import { Effect, CardInstance, Player, DamageEffect } from "../../../../core/types.js";
import { resolveAmountWithOverflow } from "./calculator.js";
import { DamageContext } from "./types.js";

// ============================================================================
// TYPES (re-export for convenience, additional types only)
// ============================================================================

export { DamageContext } from "./types.js";

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
    ctx: DamageContext
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
    return getPool(targetSpec, ctx.owner, ctx.sourceCard || null, dEff.condition)
        .filter(c => c.type === "Follower");
}

// ============================================================================
// AMOUNT RESOLUTION (EXTENDED)
// ============================================================================

export type AmountSource =
    | "fixed"           // From JSON amount field
    | "hand_size"       // Current hand size
    | "selected_defense"// DEF of selected card
    | "golem_count"     // Allied golem count
    | "other_allies"    // Count of other allies
    | "crest_count";    // Crest count

/**
 * Resolves damage amount from various sources.
 * Extends resolveAmountWithOverflow with dynamic sources.
 */
export function resolveDamageAmountExtended(
    eff: Effect,
    ctx: DamageContext,
    source: AmountSource = "fixed"
): number {
    const { owner, sourceCard, selectedCard } = ctx;

    switch (source) {
        case "hand_size": {
            const hand = owner === "blue" ? state.blueHand : state.redHand;
            return hand.length;
        }

        case "selected_defense": {
            const sel = selectedCard || (state as any).__lastSelected || null;
            return parseInt(String(sel?.defense ?? 0), 10) || 0;
        }

        case "golem_count": {
            const board = owner === "blue" ? state.blueBoard : state.redBoard;
            return board.filter(c =>
                c.type === "Follower" &&
                ((Array.isArray(c.tribes) && c.tribes.includes("Golem")) || /golem/i.test(c.name))
            ).length;
        }

        case "other_allies": {
            const board = owner === "blue" ? state.blueBoard : state.redBoard;
            // Exclude source card if present
            return board.filter(c =>
                c.type === "Follower" &&
                (!sourceCard || c.uid !== sourceCard.uid)
            ).length;
        }

        case "crest_count": {
            const list = owner === "blue" ? state.blueCrests : state.redCrests;
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
    logTag: string = "damage"
): void {
    for (const target of recipients) {
        if (target.type === "Follower") {
            logEvent(logTag, { target: target.name, uid: target.uid, amount });
            dealDamage(target, amount);
        }
    }
    cleanupDead();
}

/**
 * Apply damage to random targets N times.
 * SEMANTICS (preserved from legacy):
 * - Pool is rebuilt each hit (accounts for deaths mid-sequence)
 * - Same target CAN be hit multiple times (with replacement)
 * - Can include leader if target spec allows
 */
export function applyRandomHits(
    hitCount: number,
    amountPerHit: number,
    targetSpec: string,
    owner: Player,
    options?: { includeLeader?: boolean }
): void {
    const includeLeader = options?.includeLeader ??
        (targetSpec === "enemy" || targetSpec === "enemy:all" || targetSpec === "all");

    let remaining = hitCount;
    while (remaining-- > 0) {
        // Rebuild pool each hit
        const pool: (CardInstance | { type: "Leader"; owner: Player; name: string })[] =
            [...getPool(targetSpec, owner)];

        // Optionally add leader
        if (includeLeader) {
            const targetOwner = owner === "blue" ? "red" : "blue";
            pool.push({ type: "Leader", owner: targetOwner, name: "Enemy Leader" } as any);
        }

        const valid = pool.filter(c => c && (c.type === "Follower" || c.type === "Leader"));
        if (!valid.length) break;

        const pick = valid[state.rng.nextInt(valid.length)];
        if (!pick) break;

        logEvent("damageRandom", { target: (pick as any).name, uid: (pick as any).uid, amount: amountPerHit });

        if (pick.type === "Leader") {
            applyLeaderDamage((pick as any).owner, amountPerHit);
        } else {
            dealDamage(pick as CardInstance, amountPerHit);
        }
        cleanupDead();
    }
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
    rules?: SplitSpilloverRules
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
        const enemy = owner === "blue" ? "red" : "blue";
        applyLeaderDamage(enemy, remaining);
    }

    logEvent("damageSplitDone", {
        mode: rules?.spillToLeader ? "allEnemies" : "sequential",
        leftover: remaining
    });
    cleanupDead();
}
