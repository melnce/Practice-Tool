import { state } from "@core/gameState.js";
import { hasNecromancy, spendShadows } from "@helpers/necromancy.js";
import { isOverflow } from "@helpers/overflow.js";
import { logEvent } from "@core/logger.js";
export function handleOverflowGate(owner) {
    return isOverflow(owner);
}
export function handleNecromancyGate(owner, eff) {
    const need = Math.max(1, parseInt(eff.cost ?? 1) || 1);
    if (hasNecromancy(owner, need)) {
        spendShadows(owner, need);
        logEvent("necromancySpend", { owner, cost: need }); // ← add
        return true;
    }
    logEvent("necromancyBlocked", { owner, need }); // ← optional
    return false;
}
export function handleSuperEvoGate(owner) {
    // Check if super evolution is unlocked for this player
    if (owner === "blue") {
        return state.roundCount >= 7; // Blue super evolve unlocks at round 7
    }
    else {
        return state.roundCount >= 6; // Red super evolve unlocks at round 6
    }
}
// effects/gates.js
export function handleEvolvedSelfGate(eff, owner, sourceCard, effectsQueue) {
    const isEvolved = !!(sourceCard && sourceCard.hasEvolved);
    const next = (isEvolved ? eff.effects : eff.else_effects) || [];
    if (next.length && Array.isArray(effectsQueue)) {
        effectsQueue.unshift(...next);
    }
    logEvent("gateBranch", { gate: "evolved_self", branch: isEvolved ? "effects" : "else_effects" });
    return "done";
}
export function amuletCountGate(owner, eff) {
    const need = parseInt(eff.count ?? 0);
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const amuletCount = (board || []).filter(c => c.type === "Amulet").length;
    return amuletCount >= need;
}
/**
 * Checks if the owner's deck has no duplicate cards by name.
 * This is often called a "Highlander" condition.
 * @param {string} owner - "blue" or "red"
 * @returns {boolean} - True if no duplicates are found, otherwise false.
 */
export function hasNoDuplicatesInDeck(owner) {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    if (!deck || deck.length <= 1) {
        return true; // An empty or single-card deck has no duplicates.
    }
    const seenNames = new Set();
    for (const card of deck) {
        if (seenNames.has(card.name)) {
            logEvent("highlanderCheck", { owner, result: "fail", name: card.name });
            return false; // Found a duplicate, condition fails.
        }
        seenNames.add(card.name);
    }
    logEvent("highlanderCheck", { owner, result: "pass" });
    return true; // No duplicates found after checking the whole deck.
}
export function noAllyAttackedThisTurn(owner) {
    // hard truth first: if anyone on this side attacked, block immediately
    if (owner === "blue" ? !!state.blueAnyAllyAttackedThisTurn
        : !!state.redAnyAllyAttackedThisTurn) {
        return false;
    }
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    // A follower is considered to have attacked this turn if ANY of these are true:
    // - attacks_used_this_turn > 0
    // - hasAttacked === true (legacy/UI flag used by your combat)
    // - attacks_left < attacks_per_turn (covers multi-attack, even if counter not updated elsewhere)
    return !(board || []).some(c => {
        if (!c || c.type !== "Follower")
            return false;
        const used = (c.attacks_used_this_turn ?? 0) > 0;
        const legacy = !!c.hasAttacked;
        const perTurn = Number.isFinite(c.attacks_per_turn) ? c.attacks_per_turn : 1;
        const left = Number.isFinite(c.attacks_left) ? c.attacks_left : perTurn;
        const spent = left < perTurn;
        return used || legacy || spent;
    });
}
