// src/logic/effects/gates/gates.ts
import { state } from "../../../core/gameState.js";
import { hasNecromancy, spendShadows } from "../../../helpers/necromancy.js";
import { isOverflow } from "../../../helpers/overflow.js";
import { logEvent } from "../../../core/logger.js";
import { Player, CardInstance, Effect } from "../../../core/types.js";


export function handleOverflowGate(owner: Player) {
    return isOverflow(owner);
}

export function handleSkyboundArtGate(owner: string, eff: any, sourceCard: any) {
    // Gauge = Current Turn (roundCount) + Evolves Witnessed
    const witnesses = (sourceCard?.skyboundArtEvolvesWitnessed || 0);
    const gauge = (state.roundCount || 1) + witnesses;
    const req = parseInt(eff.requirement || eff.count || 10, 10);

    console.log(`[SkyboundGap] Gate Check: Turn=${state.roundCount} Witnessed=${witnesses} Gauge=${gauge} Req=${req} Card=${sourceCard?.name}`);

    // If gauge met -> return true (gate passes)
    if (gauge >= req) {
        return true;
    }
    return false;
}

export function handleNecromancyGate(owner: Player, eff: any) {
    const need = Math.max(1, parseInt(String(eff.cost ?? 1)) || 1);
    if (hasNecromancy(owner, need)) {
        spendShadows(owner, need);
        logEvent("necromancySpend", { owner, cost: need });
        return true;
    }
    logEvent("necromancyBlocked", { owner, need });
    return false;
}


export function handleSuperEvoGate(owner: Player) {
    // Check if super evolution is unlocked for this player
    if (owner === "blue") {
        return state.roundCount >= 7; // Blue super evolve unlocks at round 7
    } else {
        return state.roundCount >= 6; // Red super evolve unlocks at round 6
    }
}

export function handleEvolvedSelfGate(eff: Effect, owner: string, sourceCard: CardInstance, effectsQueue: Effect[]) {
    const isEvolved = !!(sourceCard && sourceCard.hasEvolved);
    // @ts-ignore
    const next = (isEvolved ? eff.effects : eff.else_effects) || [];
    if (next.length && Array.isArray(effectsQueue)) {
        effectsQueue.unshift(...next);
    }
    logEvent("gateBranch", { gate: "evolved_self", branch: isEvolved ? "effects" : "else_effects" });
    return "done";
}

export function amuletCountGate(owner: Player, eff: any) {
    const need = parseInt(eff.count ?? 0);
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    // @ts-ignore
    const amuletCount = (board || []).filter(c => c.type === "Amulet").length;
    return amuletCount >= need;
}

/**
 * Checks if the owner's deck has no duplicate cards by name.
 * This is often called a "Highlander" condition.
 */
export function hasNoDuplicatesInDeck(owner: Player) {
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

export function noAllyAttackedThisTurn(owner: Player) {
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
        if (!c || c.type !== "Follower") return false;

        // @ts-ignore
        const used = (c.attacks_used_this_turn ?? 0) > 0;
        // @ts-ignore
        const legacy = !!c.hasAttacked;

        // @ts-ignore
        const perTurn = Number.isFinite(c.attacks_per_turn) ? c.attacks_per_turn : 1;
        // @ts-ignore
        const left = Number.isFinite(c.attacks_left) ? c.attacks_left : perTurn;
        const spent = left < perTurn;

        return used || legacy || spent;
    });
}

// --- Logic Moved from effects.ts ---

export function handleBoardNameGate(owner: Player, eff: Effect, effectsQueue: Effect[]) {
    const want = String(eff.name || (eff as any).card_name || "").trim();
    if (!want) return;
    const myBoard = owner === "blue" ? state.blueBoard : state.redBoard;
    const found = (myBoard || []).some(c => String(c?.name) === want);
    if (found) {
        if (Array.isArray(eff.effects)) effectsQueue.unshift(...eff.effects!);
    } else if (Array.isArray(eff.else_effects)) {
        effectsQueue.unshift(...eff.else_effects);
    }
}

export function handleBothMaxPPGate(eff: Effect, effectsQueue: Effect[]) {
    // @ts-ignore
    const need = Number.isFinite(eff.at_least) ? eff.at_least : 10;
    const ok = (state.blueMaxPP >= need) && (state.redMaxPP >= need);
    const next = ok ? (eff.effects || []) : (eff.else_effects || []);
    if (next.length) effectsQueue.unshift(...next);
}

export function handleMaxPPGate(owner: Player, eff: Effect, effectsQueue: Effect[]) {
    // @ts-ignore
    const need = Number.isFinite(eff.at_least) ? eff.at_least : 10;
    const currentMax = owner === "blue" ? state.blueMaxPP : state.redMaxPP;
    const ok = currentMax >= need;
    const next = ok ? (eff.effects || []) : (eff.else_effects || []);
    if (next.length) effectsQueue.unshift(...next);
}

export function handleRallyGate(owner: Player, eff: any, effectsQueue: Effect[]) {
    const need = parseInt(eff.count ?? 0);
    const ownerRally = owner === "blue" ? state.blueRally : state.redRally;
    if (ownerRally >= need) {
        effectsQueue.unshift(...(eff.effects || []));
    } else if (eff.else_effects) {
        effectsQueue.unshift(...eff.else_effects);
    }
}

function getEffectiveCost(card: CardInstance) {
    // @ts-ignore
    if (Number.isFinite(card.effectiveCost)) return card.effectiveCost;
    const base = parseInt(card?.cost as string, 10) || 0;
    const mod = parseInt((card as any)?.cost_mod, 10) || 0;
    return base + mod;
}

export function handleSelfCostGate(sourceCard: CardInstance, eff: any, effectsQueue: Effect[]) {
    if (!sourceCard) return;
    const effCost = getEffectiveCost(sourceCard);
    const targetCost = parseInt(eff.cost);
    const pass = effCost === targetCost;
    const next = pass ? (eff.effects || []) : (eff.else_effects || []);
    if (next.length) effectsQueue.unshift(...next);
}

export function handleSuperEvolvedAlliedGate(owner: Player, eff: Effect, effectsQueue: Effect[]) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    // @ts-ignore
    const hasSuper = board.some(c => c.type === "Follower" && c.evoType === "super");
    const next = (hasSuper ? eff.effects : eff.else_effects) || [];
    if (next.length) effectsQueue.unshift(...next);
}

export function handleEvolvedAlliedGate(owner: Player, eff: Effect, effectsQueue: Effect[]) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    // @ts-ignore
    const hasEvolved = board.some(c => c.type === "Follower" && (c.hasEvolved || c.evoType === "super"));
    const next = (hasEvolved ? eff.effects : eff.else_effects) || [];
    if (next.length) effectsQueue.unshift(...next);
}


