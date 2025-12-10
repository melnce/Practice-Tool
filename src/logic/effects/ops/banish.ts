// effects/ops/banish.ts
import { state } from "@core/gameState.js";
import { getPool, highlightSelectable } from "@logic/core/targeting.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { randInt } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
import { CardInstance, Effect, Player } from "@core/types.js";


/**
 * Banish a single, known board card (no triggers fired here).
 */
export function handleBanish(card: CardInstance) {
    if (!card) return;
    const bi = state.blueBoard.indexOf(card);
    if (bi !== -1) { state.blueBoard.splice(bi, 1); logEvent("banish", { card: card.name, uid: card.uid }); return; }
    const ri = state.redBoard.indexOf(card);
    if (ri !== -1) { state.redBoard.splice(ri, 1); logEvent("banish", { card: card.name, uid: card.uid }); return; }
}

/**
 * Targeted banish (board targets). Respects Ambush via isTargetedEffect.
 */
export function handleBanishTargeted(eff: Effect, owner: Player, effectsQueue: any) {
    let pool = getPool(eff.target as any, owner, null, eff.condition, { isTargetedEffect: true });

    // Optional filters
    if ((eff as any).filters?.defense_lte) {
        const cap = parseInt((eff as any).filters.defense_lte);
        // @ts-ignore
        pool = pool.filter(c => (parseInt(c.defense) || 0) <= cap);
    }
    if (!pool.length) return "done";

    if ((eff as any).select) {
        state.pendingTargetEffect = {
            eff, owner, sourceCard: null, resumeEffects: effectsQueue,
            pool, targets: [], selectCount: parseInt((eff as any).select_count || 1),
        };
        logEvent("banishTargeted_select", { owner, pool: pool.length, select: parseInt((eff as any).select_count || 1) });
        highlightSelectable(pool);
        return "pending";
    }

    // No selection → banish all
    for (const target of pool) {
        const targetOwner = state.blueBoard.includes(target) ? "blue" : "red";
        fireTrigger("follower_leaves_field", targetOwner);
        logEvent("banish", { card: target.name, uid: target.uid, owner: targetOwner });
        handleBanish(target);
    }
    return "done";
}

/* -------------------- NEW: Deck-level banish helpers -------------------- */

/**
 * Return a tuple [deck, banishZone] for an owner.
 * Falls back to [] if zones not present.
 */
function getDeckAndBanish(owner: Player) {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const bzone = owner === "blue" ? state.blueBanish : state.redBanish;
    return [Array.isArray(deck) ? deck : [], Array.isArray(bzone) ? bzone : null] as [CardInstance[], CardInstance[] | null];
}

/**
 * Banish all duplicates from owner's deck, keeping the first occurrence (stable).
 * No board triggers should fire for deck manipulations.
 */
export function handleBanishDuplicatesFromDeck(owner: Player) {
    const [deck, bzone] = getDeckAndBanish(owner);
    if (!deck.length) return;

    const seen = new Set();
    const kept: CardInstance[] = [];
    const removed: CardInstance[] = [];

    for (const card of deck) {
        const key = String(card?.name || "");
        if (!key) continue;
        if (seen.has(key)) removed.push(card);
        else { seen.add(key); kept.push(card); }
    }

    // Overwrite in place
    deck.length = 0;
    deck.push(...kept);
    logEvent("banishDuplicatesFromDeck", { owner, kept: kept.length, removed: removed.length });

    // Move to banish zone if available (optional but nice for visibility)
    if (bzone && removed.length) bzone.push(...removed);
}

/**
 * Generic deck filter banish if you need other variants later.
 * Example usage: banishFromDeckWhere(owner, c => c.cost >= 5)
 */
export function banishFromDeckWhere(owner: Player, predicateFn: (c: CardInstance) => boolean) {
    const [deck, bzone] = getDeckAndBanish(owner);
    if (!deck.length) return;

    const kept: CardInstance[] = [];
    const removed: CardInstance[] = [];
    for (const c of deck) (predicateFn(c) ? removed : kept).push(c);

    deck.length = 0;
    deck.push(...kept);
    logEvent("banishFromDeckWhere", { owner, removed: removed.length });
    if (bzone && removed.length) bzone.push(...removed);
}

/**
 * Banish all enemy copies (by name) from the board.
 * @param {"blue"|"red"} owner  The acting player
 * @param {object} selected     The enemy follower previously selected
 */
export function handleBanishAllEnemyCopies(owner: Player, selected: CardInstance) {
    if (!selected || !selected.name) return;
    const oppBoard = owner === "blue" ? state.redBoard : state.blueBoard;
    const hits = oppBoard.filter(c => c?.name === selected.name);

    for (const m of hits) {
        const targetOwner = state.blueBoard.includes(m) ? "blue" : "red";
        fireTrigger("follower_leaves_field", targetOwner);
        logEvent("banish", { card: m.name, uid: m.uid, owner: targetOwner, reason: "all_enemy_copies" });
        // reuse existing single-target banish
        handleBanish(m);
    }
}

/**
 * Banish N random targets from the given pool spec.
 * Example eff: { op:"banish_random", target:"enemy:follower", count:1 }
 */
export function handleBanishRandom(eff: Effect, owner: Player) {
    let pool = getPool((eff.target as any) || "enemy:follower", owner, null, eff.condition, { isTargetedEffect: true });
    if (!Array.isArray(pool) || pool.length === 0) return;
    const n = Math.max(1, parseInt((eff.count ?? (eff as any).amount ?? 1) as any, 10) || 1);
    const take = Math.min(n, pool.length);

    for (let i = 0; i < take; i++) {
        const idx = randInt(pool.length);      // uses your seeded RNG
        const target = pool.splice(idx, 1)[0]; // remove selected target from pool
        const targetOwner = state.blueBoard.includes(target) ? "blue" : "red";
        fireTrigger("follower_leaves_field", targetOwner);
        logEvent("banish", { card: target.name, uid: target.uid, owner: targetOwner, mode: "random" });
        handleBanish(target);
    }
}
