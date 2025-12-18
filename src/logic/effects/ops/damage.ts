// src/logic/effects/ops/damage.ts
import { dealDamage } from "../../core/barrier.js";
import { state } from "../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../core/targeting.js";
import { cleanupDead } from "../../core/cleanup.js";

import { logEvent } from "../../../core/logger.js";
import { applyLeaderDamage } from "../leader.js";
import { Effect, CardInstance, Player } from "../../../core/types.js";
// @ts-ignore
import { adapter } from "../../../core/adapter.js";

// Refactored: Import calculator from damage module
import { resolveAmountWithOverflow } from "./damage/index.js";
import { setPendingTarget } from "../../core/pendingTarget/index.js";


function isAlly(card: CardInstance, owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    return board?.includes(card);
}
function isOwnTurn(owner: Player) {
    return state.activePlayer === owner;
}
function isSuperProtected(card: CardInstance, owner: Player) {
    return !!(card && card.type === "Follower" && card.evoType === "super" && isOwnTurn(owner) && isAlly(card, owner));
}

export function handleDamageAll(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    const pool = getPool(eff.target as any, owner, sourceCard, eff.condition);
    // Amount may depend on the acting card (e.g., Sinciro)
    const amt = resolveAmountWithOverflow(eff, owner, { sourceCard });

    // Handle leader damage if specified
    if (String(eff.target || "").includes("leader")) {
        const targetPlayer = (eff.target as string).includes("enemy")
            ? (owner === "blue" ? "red" : "blue")
            : owner;
        applyLeaderDamage(targetPlayer, amt); // <-- REPLACED
        return;
    }

    // Default follower damage
    for (const t of pool) if (t.type === "Follower") {
        logEvent("damageAll", { target: t.name, uid: t.uid, amount: amt });
        dealDamage(t, amt);
    }

    cleanupDead();
}

export function handleDamage(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any, context: any = {}) {
    const target = (eff.target as string) || "";
    const amt = resolveAmountWithOverflow(eff, owner, { ...context, sourceCard });

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
        applyLeaderDamage(targetPlayer, amt); // <-- REPLACED
        return "done";
    }

    const pool = getPool(target, owner, sourceCard, eff.condition, { isTargetedEffect: true })
        .filter(c => c.type === "Follower");


    const selectCount = parseInt(String(eff.select || 0)) || 0;
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

export function handleDamageRandom(eff: Effect, owner: Player) {
    const amt = resolveAmountWithOverflow(eff, owner, {});
    let hits = Math.max(1, parseInt(String(eff.count || 1)));

    const targetSpec = (eff.target as string || "").toLowerCase();

    while (hits-- > 0) {
        // Rebuild pool each hit (accounts for deaths mid-sequence)
        const pool = [...getPool(eff.target as any, owner)];

        // Include enemy leader if target is generic "enemy" or "all"
        if (targetSpec === "enemy" || targetSpec === "enemy:all" || targetSpec === "all") {
            const targetOwner = owner === "blue" ? "red" : "blue";
            // @ts-ignore
            pool.push({ type: "Leader", owner: targetOwner, name: "Enemy Leader" });
        }

        const valid = pool.filter(c => c && (c.type === "Follower" || c.type === "Leader"));
        if (!valid.length) break;

        const pick = valid[state.rng.nextInt(valid.length)];
        if (!pick) break;
        logEvent("damageRandom", { target: pick.name, uid: pick.uid, amount: amt });

        if (pick.type === "Leader") {
            // @ts-ignore
            applyLeaderDamage(pick.owner, amt);
        } else {
            dealDamage(pick as CardInstance, amt);      // super-protection will zero it out internally if applicable
        }
        cleanupDead();
    }
}

/**
 * NEW: Handles damage split sequentially across targets.
 * Damage is dealt to the first target until destroyed, then spills
 * to the next, and so on.
 */
export function handleDamageSplitSequential(eff: Effect, owner: Player) {
    // Determine total damage based on hand size
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    let damageToDeal = hand.length;

    if (damageToDeal <= 0) return;

    // Get enemy followers in the order they were played
    const pool = getPool(eff.target as any, owner).filter(c => c.type === "Follower");
    if (!pool.length) return;

    // Apply damage sequentially
    for (const target of pool) {
        if (damageToDeal <= 0) break; // All damage has been dealt

        const damageForThisTarget = Math.min(damageToDeal, target.defense as number);
        dealDamage(target, damageForThisTarget);
        damageToDeal -= damageForThisTarget;
    }
    logEvent("damageSplitDone", { mode: "sequential", leftover: damageToDeal });
    cleanupDead(); // Remove any destroyed followers
}



// REFACTORED: resolveAmountWithOverflow moved to ./damage/calculator.ts




export function handleDamageFollowerOrLeader(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any) {
    const amt = resolveAmountWithOverflow(eff, owner, { sourceCard });

    setPendingTarget({
        eff: {
            ...eff,
            op: "damage_follower_or_leader",
            amount: amt
        } as any,
        owner,
        sourceCard,
        targets: [],
        selectCount: 1,
        pool: getPool(eff.target as any, owner, sourceCard, eff.condition, { isTargetedEffect: true }),
        resumeEffects: effectsQueue,
        canTargetLeader: (eff as any).can_target_leader
    });

    logEvent("damageFoL_select", { owner, canTargetLeader: !!(eff as any).can_target_leader });

    const pool = getPool(eff.target as any, owner);
    if (pool.length) {
        highlightSelectable(pool);
    } else {
        adapter.render(); // Update UI to enable Leader selection even if no valid followers
    }

    return "pending";
}

// --- NEW: damage all by allied golem count ---
export function handleDamageAllByAlliedGolems(eff: Effect, owner: Player) {
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
export function handleDamageSplitFixed(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    // Use the configured amount (supports tokens/overflow)
    let damageToDeal = resolveAmountWithOverflow(eff, owner, { sourceCard });

    if (damageToDeal <= 0) return;

    // Get enemy followers in the order they were played
    const pool = getPool(eff.target as any, owner).filter(c => c.type === "Follower");
    if (!pool.length) return;

    for (const target of pool) {
        if (damageToDeal <= 0) break;

        const damageForThisTarget = Math.min(damageToDeal, target.defense as number);
        dealDamage(target, damageForThisTarget);
        damageToDeal -= damageForThisTarget;
    }
    logEvent("damageSplitDone", { mode: "fixed", leftover: damageToDeal });
    cleanupDead();
}

// --- NEW: damage a random enemy follower for the selected unit's current DEF ---
export function handleDamageRandomSelectedDefense(eff: Effect, owner: Player, _sourceCard: CardInstance | null, _effectsQueue: any, context: any = {}) {
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
// - If a follower dies mid-sequence, leftover damage spills to the next target,
//   and any *newly-summoned* followers from Last Words are ignored.
// - Any remaining damage after exhausting snapshot followers goes to the leader.
// - X comes from (in order): eff.count_source === "crest_count", eff.amount, or 0.
export function handleDamageSplitAllEnemies(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    // 1) Determine total pings X
    const crestCount = (() => {
        const list = owner === "blue" ? state.blueCrests : state.redCrests;
        return Array.isArray(list) ? list.length : 0;
    })();

    let total = 0;
    if (String((eff as any).count_source || "").toLowerCase() === "crest_count") {
        total = crestCount | 0;
    } else {
        total = resolveAmountWithOverflow(eff, owner, { sourceCard }) | 0;
    }
    if (total <= 0) return;

    // 2) Snapshot enemy followers (oldest → newest) at *start* of the effect
    const enemy = (owner === "blue") ? "red" : "blue";
    const enemyBoard = (enemy === "blue" ? state.blueBoard : state.redBoard) || [];
    const snapshotFollowers = enemyBoard.filter(c => c && c.type === "Follower");

    // 3) Spill pings through snapshot followers, then the rest to leader
    let remaining = total;

    for (const target of snapshotFollowers) {
        if (remaining <= 0) break;

        // Use *current* DEF to cap how many pings this follower can absorb
        const curDef = parseInt(String(target.defense), 10) || 0;
        if (curDef <= 0) continue;

        const dmg = Math.min(remaining, curDef);
        if (dmg > 0) {
            dealDamage(target, dmg);
            remaining -= dmg;
        }
    }

    // Whatever remains goes to the leader (ignores any new spawns)
    if (remaining > 0) {
        applyLeaderDamage(enemy, remaining); // <-- REPLACED
    }

    // 4) Single cleanup after the whole batch → Last Words resolve *after* all pings
    logEvent("damageSplitDone", { mode: "allEnemies", leftover: remaining });
    cleanupDead();
}


export function handleDamageHighestDefense(eff: Effect, owner: Player, sourceCard: CardInstance | null = null) {
    const amt = parseInt(String(eff.amount), 10) || 0;

    // Followers first
    if ((eff.target as string) === "follower") {
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
    if ((eff.target as string) === "leader") {
        const blueHP = state.blueHP;
        const redHP = state.redHP;
        const enemy = (blueHP >= redHP) ? "blue" : "red"; // <-- REPLACED
        applyLeaderDamage(enemy, amt); // <-- REPLACED
        return;
    }
}
