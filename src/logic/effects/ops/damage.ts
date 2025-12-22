// src/logic/effects/ops/damage.ts
import { dealDamage } from "../../core/barrier.js";
import { state } from "../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../core/targeting.js";
import { cleanupDead } from "../../core/cleanup.js";

import { logEvent } from "../../../core/logger.js";
import { applyLeaderDamage } from "../leader.js";
import { Effect, CardInstance, Player, DamageEffect } from "../../../core/types.js";
import { adapter } from "../../../core/adapter.js";

// Refactored: Import calculator from damage module
import { resolveAmountWithOverflow, applySplitSpillover, resolveDamageAmountExtended, applyDirectDamage, applyRandomHits } from "./damage/index.js";
import { setPendingTarget } from "../../core/pendingTarget/index.js";

// ... [Keep helpers isAlly, isOwnTurn, isSuperProtected implicitly if used, or remove if unused]
// They are unused in the provided code snippet for handleDamageAll, but maybe used elsewhere?
// isSuperProtected is unused. I will remove them to be safe or keep if I can't check everything.
// The snippet shows them at lines 17-26. They are unused in the functions shown.
// I will keep handles.

/**
 * REFACTORED: Now uses applyDirectDamage primitive for follower damage.
 * Leader damage path preserved separately (different semantics).
 */
export function handleDamageAll(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    const dEff = eff as DamageEffect;
    const pool = getPool(dEff.target || "", owner, sourceCard, dEff.condition);
    const amt = resolveAmountWithOverflow(dEff, owner, { sourceCard });

    // Handle leader damage if specified (separate path, different semantics)
    if (String(dEff.target || "").includes("leader")) {
        const targetPlayer = String(dEff.target || "").includes("enemy")
            ? (owner === "blue" ? "red" : "blue")
            : owner;
        applyLeaderDamage(targetPlayer, amt);
        return;
    }

    // Use primitive for follower damage
    const followers = pool.filter(c => c.type === "Follower");
    applyDirectDamage(amt, followers, "damageAll");
}

export function handleDamage(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any, context: any = {}) {
    const dEff = eff as DamageEffect;
    const target = (dEff.target as string) || "";
    const amt = resolveAmountWithOverflow(dEff, owner, { ...context, sourceCard });

    // Special: direct defender targeting (e.g., Follower Strike)
    if (target === "defender" && context?.defender) {
        dealDamage(context.defender, amt);
        cleanupDead();
        return "done";
    }

    // NEW: If targets are explicitly provided in context (e.g. from test or pre-selection), use them directly.
    if (context && Array.isArray(context.targets) && context.targets.length > 0) {
        for (const t of context.targets) {
            logEvent("damage", { target: t.name, uid: t.uid, amount: amt });
            dealDamage(t, amt);
        }
        cleanupDead();
        return "done";
    }

    if (target.includes("leader")) {
        const isEnemy = target.includes("enemy");
        const targetPlayer = isEnemy ? (owner === "blue" ? "red" : "blue") : owner;
        applyLeaderDamage(targetPlayer, amt);
        return "done";
    }

    const pool = getPool(target, owner, sourceCard, dEff.condition, { isTargetedEffect: true })
        .filter(c => c.type === "Follower");


    const selectCount = parseInt(String(dEff.select || 0)) || 0;
    if (selectCount > 0) {
        // --- MODIFIED LOGIC ---
        // Determine the actual number of targets that can be selected.
        const actualSelectCount = Math.min(selectCount, pool.length);

        // If there are no valid targets to select from the pool, end the effect.
        if (actualSelectCount === 0) {
            return "done";
        }

        // Initiate a selection process for the correct number of targets.
        setPendingTarget({
            eff,
            owner,
            sourceCard,
            targets: [],
            selectCount: actualSelectCount, // Use the adjusted, possible count
            pool,
            resumeEffects: effectsQueue,
        });
        // --- END MODIFIED LOGIC ---
        logEvent("damage_select", { owner, pool: pool.length, select: actualSelectCount, amount: amt });
        highlightSelectable(pool);
        return "pending"; // Pause the effect chain
    }

    // If no selection, damage all valid targets
    for (const t of pool) {
        logEvent("damage", { target: t.name, uid: t.uid, amount: amt });
        dealDamage(t, amt);
    }
    cleanupDead();
    return "done";
}

/**
 * REFACTORED: Now uses applyRandomHits primitive.
 * Semantics preserved: pool rebuilt each hit, leader included if target is "enemy"/"all".
 */
export function handleDamageRandom(eff: Effect, owner: Player) {
    const dEff = eff as DamageEffect;
    const amt = resolveAmountWithOverflow(dEff, owner, {});
    const hits = Math.max(1, parseInt(String(dEff.count || dEff["count" as keyof DamageEffect] || 1)));
    const targetSpec = (dEff.target || "").toLowerCase();

    // Use primitive - it handles pool rebuild, leader inclusion, and cleanup
    applyRandomHits(hits, amt, targetSpec, owner);
}

/**
 * NEW: Handles damage split sequentially across targets.
 * Damage is dealt to the first target until destroyed, then spills
 * to the next, and so on.
 * REFACTORED: Now uses applySplitSpillover primitive.
 */
export function handleDamageSplitSequential(eff: Effect, owner: Player) {
    const dEff = eff as DamageEffect;
    // Amount based on hand size
    const totalAmount = resolveDamageAmountExtended(eff, { owner, sourceCard: null }, "hand_size");
    if (totalAmount <= 0) return;

    const pool = getPool(dEff.target || "", owner).filter(c => c.type === "Follower");
    if (!pool.length) return;

    applySplitSpillover(totalAmount, pool, owner, { spillToLeader: false });
}



// REFACTORED: resolveAmountWithOverflow moved to ./damage/calculator.ts




export function handleDamageFollowerOrLeader(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any) {
    const dEff = eff as DamageEffect;
    const amt = resolveAmountWithOverflow(dEff, owner, { sourceCard });

    setPendingTarget({
        eff: {
            ...dEff,
            op: "damage", // Canonical op
            amount: amt,
            fallback_leader: (dEff as any).fallback_leader ?? true
        } as any,
        owner,
        sourceCard,
        targets: [],
        selectCount: 1,
        pool: getPool(dEff.target || "", owner, sourceCard, dEff.condition, { isTargetedEffect: true }),
        resumeEffects: effectsQueue,
        canTargetLeader: (dEff as any).fallback_leader ?? true
    });

    logEvent("damage_select", { owner, canTargetLeader: true });

    const pool = getPool(dEff.target || "", owner);
    if (pool.length) {
        highlightSelectable(pool);
    } else {
        adapter.render(); // Update UI to enable Leader selection even if no valid followers
    }

    return "pending";
}

// --- NEW: damage all by allied golem count ---
export function handleDamageAllByAlliedGolems(_eff: Effect, owner: Player) {
    // Count allied Golem followers on field
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const golemCount = board.filter(c =>
        c.type === "Follower" &&
        (
            (Array.isArray(c.tribes) && c.tribes.includes("Golem")) ||
            /golem/i.test(c.name)
        )
    ).length;

    if (golemCount <= 0) return;

    // Damage all enemy followers
    const enemy = owner === "blue" ? "red" : "blue";
    const pool = (enemy === "blue" ? state.blueBoard : state.redBoard)
        .filter(c => c.type === "Follower");

    for (const t of pool) dealDamage(t, golemCount);

    cleanupDead();
}
/**
 * REFACTORED: Now uses applySplitSpillover primitive.
 */
export function handleDamageSplitFixed(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    const dEff = eff as DamageEffect;
    const totalAmount = resolveAmountWithOverflow(dEff, owner, { sourceCard });
    if (totalAmount <= 0) return;

    const pool = getPool(dEff.target || "", owner).filter(c => c.type === "Follower");
    if (!pool.length) return;

    applySplitSpillover(totalAmount, pool, owner, { spillToLeader: false });
}

// --- NEW: damage a random enemy follower for the selected unit's current DEF ---
export function handleDamageRandomSelectedDefense(_eff: Effect, owner: Player, _sourceCard: CardInstance | null, _effectsQueue: any, context: any = {}) {
    // Prefer the selection context; fall back to the global pointer if present
    const sel = context.selectedCard || state.__lastSelected || null;
    const dmg = parseInt(String(sel?.defense ?? 0), 10) || 0;
    if (dmg <= 0) return;

    const pool = getPool("enemy:follower", owner).filter(c => c && c.type === "Follower");
    if (!pool.length) return;

    const pick = pool[state.rng.nextInt(pool.length)];
    if (!pick) return;
    dealDamage(pick, dmg);
    cleanupDead();
}

// NEW: split X pings across enemies, snapshotting the board and cleaning up once.
// ...
/**
 * REFACTORED: Now uses applySplitSpillover primitive with spillToLeader enabled.
 */
export function handleDamageSplitAllEnemies(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    const dEff = eff as DamageEffect;

    // Determine total amount - support crest_count source
    let total: number;
    if (String(dEff.count_source || "").toLowerCase() === "crest_count") {
        total = resolveDamageAmountExtended(eff, { owner, sourceCard }, "crest_count");
    } else {
        total = resolveAmountWithOverflow(dEff, owner, { sourceCard }) | 0;
    }
    if (total <= 0) return;

    // Snapshot enemy followers
    const enemy = (owner === "blue") ? "red" : "blue";
    const enemyBoard = (enemy === "blue" ? state.blueBoard : state.redBoard) || [];
    const snapshotFollowers = enemyBoard.filter(c => c && c.type === "Follower");

    // Use primitive with spillToLeader enabled
    applySplitSpillover(total, snapshotFollowers, owner, { spillToLeader: true });

    // Primitive handles logging and cleanup - done
    logEvent("damageSplitDone_outer", { mode: "allEnemies", total });
}


export function handleDamageHighestDefense(eff: Effect, _owner: Player, _sourceCard: CardInstance | null = null) {
    const dEff = eff as DamageEffect;
    const amt = parseInt(String(dEff.amount), 10) || 0;

    // Followers first
    if ((dEff.target as string) === "follower") {
        const allFollowers = [...(state.blueBoard || []), ...(state.redBoard || [])]
            .filter(c => c && c.type === "Follower");

        if (!allFollowers.length) return;

        const maxDef = Math.max(...allFollowers.map(c => parseInt(String(c.defense), 10) || 0));
        const targets = allFollowers.filter(c => (parseInt(String(c.defense), 10) || 0) === maxDef);

        for (const t of targets) dealDamage(t, amt);
        cleanupDead();
        return;
    }

    // Leaders
    if ((dEff.target as string) === "leader") {
        const blueHP = state.blueHP;
        const redHP = state.redHP;
        const enemy = (blueHP >= redHP) ? "blue" : "red";
        applyLeaderDamage(enemy, amt);
        return;
    }
}
