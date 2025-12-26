// src/logic/effects/gates/conditions.ts
// Condition evaluator registry - each condition is a separate, testable function

import { state } from "../../../core/gameState.js";
import { hasNecromancy, spendShadows } from "../../../helpers/necromancy.js";
import { isOverflow } from "../../../helpers/overflow.js";
import { logEvent } from "../../../core/logger.js";
import { Player, CardInstance } from "../../../core/types/index.js";
import { UnifiedGateSpec } from "./types.js";
import {
    isFirstPlayer,
    getMaxPP,
    getPlaysThisTurn,
    getHand,
    getBoard,
    getDeck,
    getRally,
    getAnyAllyAttackedThisTurn,
} from "../../../core/playerHelpers.js";

// =============================================================================
// CONDITION EVALUATOR TYPE
// =============================================================================

export type ConditionEvaluator = (
    spec: UnifiedGateSpec,
    owner: Player,
    sourceCard: CardInstance | null,
) => boolean;

// =============================================================================
// CONDITION REGISTRY
// =============================================================================

const conditionRegistry = new Map<string, ConditionEvaluator>();

export function registerCondition(name: string, evaluator: ConditionEvaluator): void {
    if (conditionRegistry.has(name)) {
        console.warn(`[Gate] Condition "${name}" already registered, overwriting`);
    }
    conditionRegistry.set(name, evaluator);
}

export function getConditionEvaluator(name: string): ConditionEvaluator | undefined {
    return conditionRegistry.get(name);
}

export function evaluateCondition(
    spec: UnifiedGateSpec,
    owner: Player,
    sourceCard: CardInstance | null,
): boolean {
    const evaluator = conditionRegistry.get(spec.condition);
    if (!evaluator) {
        console.warn(`[Gate] Unknown condition: ${spec.condition}`);
        return false;
    }
    return evaluator(spec, owner, sourceCard);
}

// =============================================================================
// RESOURCE CONDITIONS
// =============================================================================

registerCondition("necromancy", (spec, owner) => {
    const need = Math.max(1, spec.cost || 1);
    if (hasNecromancy(owner, need)) {
        spendShadows(owner, need);
        logEvent("necromancySpend", { owner, cost: need });
        return true;
    }
    logEvent("necromancyBlocked", { owner, need });
    return false;
});

registerCondition("overflow", (_spec, owner) => isOverflow(owner));

// =============================================================================
// PP CONDITIONS
// =============================================================================

registerCondition("max_pp", (spec, owner) => {
    const need = spec.at_least ?? 10;
    return getMaxPP(state, owner) >= need;
});

registerCondition("both_max_pp", (spec) => {
    const need = spec.at_least ?? 10;
    return getMaxPP(state, "first") >= need && getMaxPP(state, "second") >= need;
});

// =============================================================================
// COUNT CONDITIONS
// =============================================================================

registerCondition("combo", (spec, owner) => {
    const need = spec.count ?? 1;
    return getPlaysThisTurn(state, owner) >= need;
});

registerCondition("rally", (spec, owner) => {
    const need = spec.count ?? 1;
    return getRally(state, owner) >= need;
});

registerCondition("hand_count", (spec, owner) => {
    const need = spec.count ?? 1;
    return getHand(state, owner).length >= need;
});

registerCondition("amulet_count", (spec, owner) => {
    const need = spec.count ?? 1;
    const board = getBoard(state, owner);
    return (board || []).filter((c) => c.type === "Amulet").length >= need;
});

registerCondition("spellboost_count", (spec, _owner, sourceCard) => {
    if (!sourceCard) return false;
    const count =
        sourceCard.keywordState?.spellboostCount ??
        sourceCard.spellboostCount ??
        0;
    const need = spec.count ?? 1;
    return count >= need;
});

// =============================================================================
// EVOLUTION CONDITIONS
// =============================================================================

registerCondition("evolved_self", (_spec, _owner, sourceCard) => {
    return !!(sourceCard && sourceCard.hasEvolved);
});

registerCondition("super_evolved_self", (_spec, _owner, sourceCard) => {
    return !!(
        sourceCard &&
        sourceCard.type === "Follower" &&
        sourceCard.evoType === "super"
    );
});

registerCondition("evolved_allied", (_spec, owner) => {
    const board = getBoard(state, owner);
    return board.some(
        (c) => c.type === "Follower" && (c.hasEvolved || c.evoType === "super"),
    );
});

registerCondition("super_evolved_allied", (_spec, owner) => {
    const board = getBoard(state, owner);
    return board.some((c) => c.type === "Follower" && c.evoType === "super");
});

registerCondition("super_evo_unlocked", (_spec, owner) => {
    return isFirstPlayer(owner) ? state.roundCount >= 7 : state.roundCount >= 6;
});

// =============================================================================
// BOARD/CARD CONDITIONS
// =============================================================================

registerCondition("board_name", (spec, owner) => {
    const want = String(spec.name || "").trim();
    if (!want) return false;
    const myBoard = getBoard(state, owner);
    return (myBoard || []).some((c) => String(c?.name) === want);
});

registerCondition("self_cost", (spec, _owner, sourceCard) => {
    if (!sourceCard) return false;
    const effCost = getEffectiveCost(sourceCard);
    const targetCost = spec.cost ?? 0;
    return effCost === targetCost;
});

// =============================================================================
// SPECIAL CONDITIONS
// =============================================================================

registerCondition("skybound_art", (spec, _owner, sourceCard) => {
    const witnesses = (sourceCard as any)?.skyboundArtEvolvesWitnessed || 0;
    const gauge = (state.roundCount || 1) + witnesses;
    const req = spec.requirement ?? 10;
    return gauge >= req;
});

registerCondition("no_ally_attacked", (_spec, owner) => {
    if (getAnyAllyAttackedThisTurn(state, owner)) {
        return false;
    }
    const board = getBoard(state, owner);
    return !(board || []).some((c) => {
        if (!c || c.type !== "Follower") return false;
        const used = (c.attacks_used_this_turn ?? 0) > 0;
        const legacy = !!c.hasAttacked;
        const perTurn = Number.isFinite(c.attacks_per_turn)
            ? c.attacks_per_turn!
            : 1;
        const left = Number.isFinite(c.attacks_left) ? c.attacks_left! : perTurn;
        const spent = left < perTurn;
        return used || legacy || spent;
    });
});

registerCondition("highlander", (_spec, owner) => {
    const deck = getDeck(state, owner);
    if (!deck || deck.length <= 1) return true;
    const seenNames = new Set<string>();
    for (const card of deck) {
        if (seenNames.has(card.name)) {
            logEvent("highlanderCheck", { owner, result: "fail", name: card.name });
            return false;
        }
        seenNames.add(card.name);
    }
    logEvent("highlanderCheck", { owner, result: "pass" });
    return true;
});

registerCondition("fused_this_turn", (_spec, _owner, sourceCard) => {
    if (!sourceCard) return false;
    // Check if any cards have been fused to this card instance
    // Logic differs by expansion but usually stored in _fusedLootNames or _fusedCards
    const fused = (sourceCard as any)._fusedLootNames || (sourceCard as any)._fusedCards;
    return Array.isArray(fused) && fused.length > 0;
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getEffectiveCost(card: CardInstance): number {
    if (Number.isFinite(card.effectiveCost)) return card.effectiveCost!;
    const base = parseInt(card?.cost as string, 10) || 0;
    const mod = parseInt((card as any)?.cost_mod, 10) || 0;
    return base + mod;
}
