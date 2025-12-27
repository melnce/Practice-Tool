// src/logic/effects/ops/damage/helpers.ts
// Damage handler helper functions - separated for modularity

import { state } from "../../../../core/gameState.js";
import { highlightSelectable } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { applyLeaderDamage } from "../../leader.js";
import { dealDamage } from "../../../core/barrier.js";
import type { Effect, CardInstance, Player } from "../../../../core/types/index.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import { getBoard, getHP } from "../../../../core/playerHelpers.js";

import type { UnifiedDamageSpec, DamageContext } from "./types.js";
import { resolveAmountWithOverflow } from "./calculator.js";
import { resolveDamageAmountExtended } from "./primitives.js";

// =============================================================================
// AMOUNT RESOLUTION
// =============================================================================

/**
 * Resolves the damage amount based on spec and context.
 * Handles various amount_source values like hand_size, golem_count, etc.
 */
export function resolveAmount(spec: UnifiedDamageSpec, ctx: DamageContext): number {
    const source = spec.amount_source as string;

    // Handle context.* pattern - read from ctx.variables
    if (source && source.startsWith("context.")) {
        const varName = source.substring(8); // Remove "context." prefix
        const value = (ctx as any).variables?.[varName];
        if (value === undefined) {
            console.warn(`[Context] Variable '${varName}' not found, defaulting to 0`);
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
            // Include add_amount for effects like Stormy Blast that add to base damage
            return resolveAmountWithOverflow(
                { amount: spec.amount, add_amount: spec.add_amount } as any,
                ctx.owner,
                { sourceCard: ctx.sourceCard },
            );
    }
}

// =============================================================================
// SELECTION HANDLING
// =============================================================================

/**
 * Sets up pending target selection for damage effects that require user choice.
 */
export function handleSelection(
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
    }

    return "pending";
}

// =============================================================================
// DISTRIBUTION HANDLERS
// =============================================================================

/**
 * Handles damage distribution based on stat values (e.g., highest defense).
 */
export function handleByStatDamage(
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
