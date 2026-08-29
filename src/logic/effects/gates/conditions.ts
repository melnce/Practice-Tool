// src/logic/effects/gates/conditions.ts
// Condition evaluator registry - each condition is a separate, testable function

import { state } from "../../../core/gameState.js";
import { hasNecromancy, spendShadows } from "../../../helpers/necromancy.js";
import { isOverflow } from "../../../helpers/overflow.js";
import { logEvent } from "../../../core/logger.js";
import type { Player, CardInstance } from "../../../core/types/index.js";
import type { UnifiedGateSpec } from "./types.js";
import { handleSuperEvoGate } from "./gates.js";
import {
  isFirstPlayer,
  getMaxPP,
  getPP,
  getPlaysThisTurn,
  getHand,
  getBoard,
  getDeck,
  getRally,
  getAnyAllyAttackedThisTurn,
  getAllyAttackedLeaderLastTurn,
  getHP,
  opponentOf,
} from "../../../core/playerHelpers.js";
import {
  evaluateCardCondition,
  type CardCondition,
} from "../../core/conditions/evaluator.js";
import {
  countUniqueTribeEnters,
  countNamedEnters,
} from "../../core/followerEnterHistory.js";
import {
  hasPlayedBaseCostLadder,
  DEFAULT_FULL_COST_LADDER,
} from "../../core/playedBaseCostHistory.js";

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

export function registerCondition(
  name: string,
  evaluator: ConditionEvaluator,
): void {
  if (conditionRegistry.has(name)) {
    console.warn(`[Gate] Condition "${name}" already registered, overwriting`);
  }
  conditionRegistry.set(name, evaluator);
}

export function getConditionEvaluator(
  name: string,
): ConditionEvaluator | undefined {
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

registerCondition("pp_at_least", (spec, owner) => {
  const need = spec.count ?? 1;
  return getPP(state, owner) >= need;
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

registerCondition("hand_count_lte", (spec, owner) => {
  const max = spec.count ?? 5;
  return getHand(state, owner).length <= max;
});

registerCondition("amulet_count", (spec, owner) => {
  const need = spec.count ?? 1;
  const board = getBoard(state, owner);
  return (board || []).filter((c) => c.type === "Amulet").length >= need;
});

registerCondition("spellboost_count", (spec, _owner, sourceCard) => {
  if (!sourceCard) return false;
  const count =
    sourceCard.keywordState?.spellboostCount ?? sourceCard.spellboostCount ?? 0;
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
  return handleSuperEvoGate(owner);
});

registerCondition("has_fuse_materials", (_spec, _owner, sourceCard) => {
  if (!sourceCard) return false;
  const fusedNames = (sourceCard as any)._fusedLootNames;
  if (Array.isArray(fusedNames) && fusedNames.length > 0) return true;
  return !!(sourceCard as any).isFused;
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

function countBoardMatches(
  cards: CardInstance[],
  spec: UnifiedGateSpec,
  sourceCard: CardInstance | null,
): number {
  const filter: CardCondition = {};
  if (spec.type && String(spec.type).toLowerCase() !== "card") {
    filter.type = spec.type;
  }
  if (spec.base_cost_eq != null) filter.base_cost_eq = spec.base_cost_eq;
  if (spec.base_cost_gte != null) filter.base_cost_gte = spec.base_cost_gte;
  if (spec.base_cost_lte != null) filter.base_cost_lte = spec.base_cost_lte;
  if (spec.name) filter.name = spec.name;
  if ((spec as any).class) filter.class = String((spec as any).class);
  if (spec.tribe) filter.tribe = spec.tribe;
  if (spec.has_keyword) filter.has_keyword = spec.has_keyword;
  return cards.filter(
    (card) =>
      !(spec.exclude_self && sourceCard && card.uid === sourceCard.uid) &&
      evaluateCardCondition(card, filter),
  ).length;
}

registerCondition("ally_matches", (spec, owner, sourceCard) => {
  const board = getBoard(state, owner) || [];
  return countBoardMatches(board, spec, sourceCard) >= (spec.count ?? 1);
});

registerCondition("field_matches", (spec, _owner, sourceCard) => {
  const field = [
    ...(getBoard(state, "first") || []),
    ...(getBoard(state, "second") || []),
  ];
  return countBoardMatches(field, spec, sourceCard) >= (spec.count ?? 1);
});

/**
 * True if the field has a card other than playedCard/source whose base cost
 * matches the played card's base cost. Used by World of Games.
 */
registerCondition("field_other_same_base_cost", (spec, _owner, sourceCard) => {
  const played =
    (spec as any).playedCard ||
    (state as any).__lastPlayedCard ||
    sourceCard ||
    null;
  if (!played) return false;
  const base =
    played.base_cost !== undefined
      ? Number(played.base_cost)
      : parseInt(String(played.cost), 10) || 0;
  const field = [
    ...(getBoard(state, "first") || []),
    ...(getBoard(state, "second") || []),
  ];
  return field.some((c) => {
    if (!c || c.uid === played.uid) return false;
    const cb =
      c.base_cost !== undefined
        ? Number(c.base_cost)
        : parseInt(String(c.cost), 10) || 0;
    return cb === base;
  });
});

/** True if the most recently selected card matches type/ally filters. */
registerCondition("selected_matches", (spec, owner) => {
  const selected =
    (state as any).__lastSelected || (state as any).lastSelected?.[0] || null;
  if (!selected) return false;
  if (spec.type) {
    if (
      String(selected.type || "").toLowerCase() !==
      String(spec.type).toLowerCase()
    ) {
      return false;
    }
  }
  if (spec.is_ally === true && selected.owner !== owner) return false;
  if (spec.is_ally === false && selected.owner === owner) return false;
  if ((spec as any).ally === true && selected.owner !== owner) return false;
  return true;
});

registerCondition("unique_tribe_enters", (spec, owner) => {
  const tribe = String(spec.tribe || "Artifact");
  const need = spec.count ?? spec.at_least ?? 1;
  return countUniqueTribeEnters(state, owner, tribe) >= need;
});

registerCondition("named_enter_count", (spec, owner, sourceCard) => {
  const name = String(spec.name || sourceCard?.name || "");
  const need = spec.count ?? spec.at_least ?? 1;
  return countNamedEnters(state, owner, name) >= need;
});

registerCondition("hand_matches", (spec, owner) => {
  const hand = getHand(state, owner) || [];
  const filter: CardCondition = {};
  if (spec.type) filter.type = spec.type;
  if (spec.tribe) filter.tribe = spec.tribe;
  if (spec.name) filter.name = spec.name;
  if ((spec as any).class) filter.class = String((spec as any).class);
  if (spec.base_cost_eq != null) filter.base_cost_eq = spec.base_cost_eq;
  if (spec.base_cost_gte != null) filter.base_cost_gte = spec.base_cost_gte;
  if (spec.base_cost_lte != null) filter.base_cost_lte = spec.base_cost_lte;
  const n = hand.filter((c) => evaluateCardCondition(c, filter)).length;
  return n >= (spec.count ?? 1);
});

registerCondition("leader_defense_lte", (spec, owner) => {
  const lim = spec.count ?? spec.at_least ?? 0;
  return getHP(state, owner) <= lim;
});

registerCondition("leader_defense_gt_enemy", (spec, owner) => {
  void spec;
  return getHP(state, owner) > getHP(state, opponentOf(owner));
});

registerCondition("last_discarded_type", (spec) => {
  if (!spec.type) return false;
  return (
    String(state.lastDiscardedType || "").toLowerCase() ===
    String(spec.type).toLowerCase()
  );
});

/** True if the hand has ≥ `count` cards that share one common cost. */
registerCondition("hand_same_cost_gte", (spec, owner) => {
  const need = spec.count ?? spec.at_least ?? 4;
  const hand = getHand(state, owner) || [];
  const byCost = new Map<number, number>();
  for (const c of hand) {
    const cost = Number(c?.cost) || 0;
    byCost.set(cost, (byCost.get(cost) || 0) + 1);
  }
  for (const n of byCost.values()) {
    if (n >= need) return true;
  }
  return false;
});

/**
 * Sum of the N highest printed/base costs in owner's hand
 * vs the same sum for the opponent. Used by Behemoth General.
 */
registerCondition("hand_top_base_costs_gt_enemy", (spec, owner) => {
  const n = Math.max(1, spec.count ?? 3);
  const sumTop = (player: Player): number => {
    const hand = getHand(state, player) || [];
    const costs = hand
      .map((c) => {
        const base = (c as any)?.base_cost;
        if (base !== undefined && base !== null && base !== "") {
          return parseInt(String(base), 10) || 0;
        }
        return parseInt(String(c?.cost), 10) || 0;
      })
      .sort((a, b) => b - a);
    return costs.slice(0, n).reduce((s, v) => s + v, 0);
  };
  return sumTop(owner) > sumTop(opponentOf(owner));
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

registerCondition("played_base_cost_ladder", (spec, owner) => {
  const ladder = Array.isArray((spec as any).costs)
    ? (spec as any).costs.map((c: unknown) => Number(c)).filter(Number.isFinite)
    : [...DEFAULT_FULL_COST_LADDER];
  return hasPlayedBaseCostLadder(state, owner, ladder);
});

registerCondition("ally_attacked_leader_last_turn", (_spec, owner) => {
  return getAllyAttackedLeaderLastTurn(state, owner);
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
  return !!(sourceCard as any).isFused;
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
