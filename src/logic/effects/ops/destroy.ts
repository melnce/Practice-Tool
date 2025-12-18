// src/logic/effects/ops/destroy.ts
import { getPool, highlightSelectable } from "../../core/targeting.js";
import { cleanupDead } from "../../core/cleanup.js";
import { state } from "../../../core/gameState.js";
import { runEffects } from "../../core/effects/index.js";


import { logEvent } from "../../../core/logger.js";
import { CardInstance, Effect, Player } from "../../../core/types.js";

// --- helpers --------------------------------------------------------------
function isAlly(card: CardInstance, owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    return board?.includes(card);
}
function isOwnTurn(owner: Player) {
    return state.activePlayer === owner;
}
function isSuperProtected(card: CardInstance, owner: Player) {
    return !!(
        card &&
        card.type === "Follower" &&
        card.evoType === "super" &&
        isOwnTurn(owner) &&
        isAlly(card, owner)
    );
}

// Destroy the highest attack followers (break ties randomly)
export function handleDestroyHighest(eff: Effect, owner: Player) {
    const pool = getPool(eff.target as any, owner).filter(
        (c) => c.type === "Follower" && (parseInt(String(c.defense), 10) || 0) > 0
    );
    if (!pool.length) return;

    const highest = Math.max(...pool.map((c) => parseInt(String(c.attack), 10) || 0));
    const top = pool.filter((c) => (parseInt(String(c.attack), 10) || 0) === highest);

    let n = Math.max(1, parseInt(String(eff.count || 1), 10));
    while (n-- > 0 && top.length) {
        const i = state.rng.nextInt(top.length);
        const pick = top.splice(i, 1)[0];
        if (pick && !pick.keywordState?.cannotBeDestroyed && !isSuperProtected(pick, owner)) {
            logEvent("destroy", { target: pick.name, uid: pick.uid, reason: "highest_attack" });
            pick.defense = 0;
        }
    }
    cleanupDead();
}

// Destroy all from target (followers die; amulets move to grave + LW)
export function handleDestroyAll(eff: Effect, owner: Player, sourceCard: CardInstance | null = null, context: any = {}) {
    let pool = getPool(
        (eff.target as any) || "all:follower",
        owner,
        sourceCard,
        eff.condition,
        context
    );

    pool = pool.filter(
        (c) =>
            c &&
            ((c.type === "Follower" && (parseInt(String(c.defense), 10) || 0) > 0) ||
                c.type === "Amulet")
    );
    if (!pool.length) return;

    for (const card of pool) {
        const cardOwner = state.blueBoard.includes(card)
            ? "blue"
            : state.redBoard.includes(card)
                ? "red"
                : null;
        if (!cardOwner) continue;

        if (card.keywordState?.cannotBeDestroyed) continue;

        if (card.type === "Follower") {
            if (isSuperProtected(card, cardOwner)) continue;
            logEvent("destroy", { target: card.name, uid: card.uid, type: card.type, reason: "destroy_all" });
            card.defense = 0;
            continue;
        }

        // Amulet: remove to grave + fire Last Words
        if (card.type === "Amulet") {
            const board = cardOwner === "blue" ? state.blueBoard : state.redBoard;
            const grave = cardOwner === "blue" ? state.blueGraveyard : state.redGraveyard;
            const idx = board.indexOf(card);
            if (idx !== -1) {
                logEvent("destroy", { target: card.name, uid: card.uid, type: card.type, reason: "destroy_all" });
                const removed = board.splice(idx, 1)[0];
                if (!removed) continue;
                grave.push(removed);
                if (cardOwner === "blue") state.blueShadows++;
                else state.redShadows++;
                const lw = removed.keywordState?.lastWordsEffects || (removed as any).lastWordsEffects;
                if (removed.hasLastWords && Array.isArray(lw)) {
                    runEffects([...lw], cardOwner, removed);
                }
            }
        }
    }
    cleanupDead();
}

// Targeted destroy (with selection UI)
export function handleDestroy(eff: Effect, owner: Player, effectsQueue: any, context: any = {}, sourceCard: CardInstance | null = null) {
    if (String(eff.target).toLowerCase().startsWith("selected")) {
        const targets = getPool(eff.target as any, owner, null, eff.condition, context);
        let count = 0;
        for (const target of targets) {
            if (resolveDestroy(target, owner)) count++;
        }
        cleanupDead();
        return count;
    }

    const pool = getPool(
        eff.target as any,
        owner,
        sourceCard,
        eff.condition,
        { isTargetedEffect: true }
    ).filter((c) => c && (c.type === "Follower" || c.type === "Amulet"));

    if (pool.length) {
        logEvent("destroy_select", { owner, pool: pool.length, select: parseInt(String(eff.select ?? (eff as any).select_count ?? 1), 10) });
        state.pendingTargetEffect = {
            eff,
            owner,
            sourceCard,
            resumeEffects: effectsQueue,
            pool,
            targets: [],
            selectCount: parseInt(String(eff.select ?? (eff as any).select_count ?? 1), 10),
        };
        highlightSelectable(pool);
        return "pending";
    }

    return "done";
}

// Resolve a single destroy against a specific permanent
export function resolveDestroy(target: CardInstance, owner: Player) {
    if (!target) return;

    const inferredOwner = state.blueBoard.includes(target)
        ? "blue"
        : state.redBoard.includes(target)
            ? "red"
            : owner;

    if (target.keywordState?.cannotBeDestroyed) return;
    if (isSuperProtected(target, inferredOwner)) return;

    logEvent("destroy", { target: target.name, uid: target.uid, type: target.type, reason: "targeted" });

    if (target.type === "Follower") {
        target.defense = 0;
        return true;
    }

    if (target.type === "Amulet") {
        const board = inferredOwner === "blue" ? state.blueBoard : state.redBoard;
        const grave = inferredOwner === "blue" ? state.blueGraveyard : state.redGraveyard;
        const idx = board.indexOf(target);
        if (idx !== -1) {
            const removed = board.splice(idx, 1)[0];
            if (!removed) return false;
            grave.push(removed);
            const lw = removed.keywordState?.lastWordsEffects || (removed as any).lastWordsEffects;
            if (removed.hasLastWords && Array.isArray(lw)) {
                runEffects([...lw], inferredOwner, removed);
            }
            return true;
        }
    }
    return false;
}

// Destroy all allied amulets; returns count
export function destroyAlliedAmulets(owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;
    let destroyed = 0;

    for (let i = board.length - 1; i >= 0; i--) {
        const c = board[i];
        if (!c || c.type !== "Amulet") continue;

        const removed = board.splice(i, 1)[0];
        if (!removed) continue;
        logEvent("destroy", { target: removed.name, uid: removed.uid, type: "Amulet", reason: "destroy_allied_amulets" });
        grave.push(removed);
        if (owner === "blue") state.blueShadows++;
        else state.redShadows++;
        destroyed++;

        const lw = removed.keywordState?.lastWordsEffects || (removed as any).lastWordsEffects;
        if (removed.hasLastWords && Array.isArray(lw)) {
            runEffects([...lw], owner, removed);
        }
    }
    return destroyed;
}

// Destroy N random followers from the target pool
// Respects eff.exclude: "context.defender", "context.attacker", "uid:<uid>"
export function handleDestroyRandom(eff: Effect, owner: Player, context: any = {}) {
    // 1) base pool
    let pool = getPool(
        (eff.target as any) || "enemy:follower",
        owner,
        null,
        eff.condition,
        context
    ).filter((c) => c && c.type === "Follower" && (parseInt(String(c.defense), 10) || 0) > 0);

    if (!pool.length) return;

    // 2) excludes
    const excludes = new Set();
    const ex = (eff as any).exclude;
    const list = Array.isArray(ex) ? ex : ex ? [ex] : [];

    for (const token of list) {
        const t = String(token || "").trim().toLowerCase();
        if (!t) continue;
        if (t === "context.defender" && context?.defender?.uid) {
            excludes.add(context.defender.uid);
        } else if (t === "context.attacker" && context?.attacker?.uid) {
            excludes.add(context.attacker.uid);
        } else if (t.startsWith("uid:")) {
            const uid = token.slice(4);
            if (uid) excludes.add(uid);
        }
    }

    if (excludes.size) {
        pool = pool.filter((c) => !excludes.has(c.uid));
        if (!pool.length) return;
    }

    // 3) pick & destroy
    let n = Math.max(1, parseInt(String(eff.count ?? 1), 10));
    while (n-- > 0 && pool.length) {
        const idx = state.rng.nextInt(pool.length);
        const pick = pool.splice(idx, 1)[0];
        if (!pick) continue;

        if (pick.keywordState?.cannotBeDestroyed) continue;

        const cardOwner = state.blueBoard.includes(pick)
            ? "blue"
            : state.redBoard.includes(pick)
                ? "red"
                : null;

        if (cardOwner && isSuperProtected(pick, cardOwner)) continue;

        logEvent("destroy", { target: pick.name, uid: pick.uid, reason: "random" });
        pick.defense = 0;
    }

    cleanupDead();
}
