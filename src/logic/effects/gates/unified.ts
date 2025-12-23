// src/logic/effects/gates/unified.ts

import { state } from "../../../core/gameState.js";
import { hasNecromancy, spendShadows } from "../../../helpers/necromancy.js";
import { isOverflow } from "../../../helpers/overflow.js";
import { logEvent } from "../../../core/logger.js";
import { Player, CardInstance, Effect } from "../../../core/types.js";
import { UnifiedGateSpec, normalizeToGateSpec } from "./types.js";

/**
 * Unified gate handler - evaluates any gate condition and queues effects.
 * Replaces 17 legacy gate handlers.
 */
export function handleGate(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
): "done" {
  const spec = normalizeToGateSpec(eff);
  const passed = evaluateCondition(spec, owner, sourceCard);

  logEvent("gate", {
    condition: spec.condition,
    passed,
    owner,
    card: sourceCard?.name,
  });

  const next = passed ? spec.effects || [] : spec.else_effects || [];
  if (next.length && Array.isArray(effectsQueue)) {
    effectsQueue.unshift(...next);
  }

  return "done";
}

/**
 * Evaluates a gate condition and returns true if it passes.
 */
function evaluateCondition(
  spec: UnifiedGateSpec,
  owner: Player,
  sourceCard: CardInstance | null,
): boolean {
  switch (spec.condition) {
    // =====================================================================
    // RESOURCE GATES
    // =====================================================================
    case "necromancy": {
      const need = Math.max(1, spec.cost || 1);
      if (hasNecromancy(owner, need)) {
        spendShadows(owner, need);
        logEvent("necromancySpend", { owner, cost: need });
        return true;
      }
      logEvent("necromancyBlocked", { owner, need });
      return false;
    }

    case "overflow":
      return isOverflow(owner);

    // =====================================================================
    // PP GATES
    // =====================================================================
    case "max_pp": {
      const need = spec.at_least ?? 10;
      const currentMax = owner === "blue" ? state.blueMaxPP : state.redMaxPP;
      return currentMax >= need;
    }

    case "both_max_pp": {
      const need = spec.at_least ?? 10;
      return state.blueMaxPP >= need && state.redMaxPP >= need;
    }

    // =====================================================================
    // COUNT GATES
    // =====================================================================
    case "combo": {
      const need = spec.count ?? 1;
      const plays =
        owner === "blue"
          ? state.bluePlaysThisTurn || 0
          : state.redPlaysThisTurn || 0;
      return plays >= need;
    }

    case "rally": {
      const need = spec.count ?? 1;
      const rally = owner === "blue" ? state.blueRally : state.redRally;
      return rally >= need;
    }

    case "hand_count": {
      const need = spec.count ?? 1;
      const hand = owner === "blue" ? state.blueHand : state.redHand;
      return hand.length >= need;
    }

    case "amulet_count": {
      const need = spec.count ?? 1;
      const board = owner === "blue" ? state.blueBoard : state.redBoard;
      const amuletCount = (board || []).filter(
        (c) => c.type === "Amulet",
      ).length;
      return amuletCount >= need;
    }

    case "spellboost_count": {
      // Check the source card's spellboost count against threshold
      if (!sourceCard) return false;
      const count =
        sourceCard.keywordState?.spellboostCount ??
        sourceCard.spellboostCount ??
        0;
      const need = spec.count ?? 1;
      return count >= need;
    }

    // =====================================================================
    // EVOLUTION GATES
    // =====================================================================
    case "evolved_self":
      return !!(sourceCard && sourceCard.hasEvolved);

    case "super_evolved_self":
      return !!(
        sourceCard &&
        sourceCard.type === "Follower" &&
        sourceCard.evoType === "super"
      );

    case "evolved_allied": {
      const board = owner === "blue" ? state.blueBoard : state.redBoard;
      return board.some(
        (c) => c.type === "Follower" && (c.hasEvolved || c.evoType === "super"),
      );
    }

    case "super_evolved_allied": {
      const board = owner === "blue" ? state.blueBoard : state.redBoard;
      return board.some((c) => c.type === "Follower" && c.evoType === "super");
    }

    case "super_evo_unlocked":
      // Blue unlocks at turn 7, red at turn 6
      return owner === "blue" ? state.roundCount >= 7 : state.roundCount >= 6;

    // =====================================================================
    // BOARD/CARD GATES
    // =====================================================================
    case "board_name": {
      const want = String(spec.name || "").trim();
      if (!want) return false;
      const myBoard = owner === "blue" ? state.blueBoard : state.redBoard;
      return (myBoard || []).some((c) => String(c?.name) === want);
    }

    case "self_cost": {
      if (!sourceCard) return false;
      const effCost = getEffectiveCost(sourceCard);
      const targetCost = spec.cost ?? 0;
      return effCost === targetCost;
    }

    // =====================================================================
    // SPECIAL GATES
    // =====================================================================
    case "skybound_art": {
      const witnesses = (sourceCard as any)?.skyboundArtEvolvesWitnessed || 0;
      const gauge = (state.roundCount || 1) + witnesses;
      const req = spec.requirement ?? 10;
      console.log(
        `[Gate] Skybound Art: Turn=${state.roundCount} Witnessed=${witnesses} Gauge=${gauge} Req=${req}`,
      );
      return gauge >= req;
    }

    case "no_ally_attacked": {
      // Check global flag first
      if (
        owner === "blue"
          ? !!state.blueAnyAllyAttackedThisTurn
          : !!state.redAnyAllyAttackedThisTurn
      ) {
        return false;
      }
      const board = owner === "blue" ? state.blueBoard : state.redBoard;
      return !(board || []).some((c) => {
        if (!c || c.type !== "Follower") return false;
        const used = (c.attacks_used_this_turn ?? 0) > 0;
        const legacy = !!c.hasAttacked;
        const perTurn = Number.isFinite(c.attacks_per_turn)
          ? c.attacks_per_turn!
          : 1;
        const left = Number.isFinite(c.attacks_left)
          ? c.attacks_left!
          : perTurn;
        const spent = left < perTurn;
        return used || legacy || spent;
      });
    }

    case "highlander": {
      const deck = owner === "blue" ? state.blueDeck : state.redDeck;
      if (!deck || deck.length <= 1) return true;
      const seenNames = new Set<string>();
      for (const card of deck) {
        if (seenNames.has(card.name)) {
          logEvent("highlanderCheck", {
            owner,
            result: "fail",
            name: card.name,
          });
          return false;
        }
        seenNames.add(card.name);
      }
      logEvent("highlanderCheck", { owner, result: "pass" });
      return true;
    }

    default:
      console.warn(`[Gate] Unknown condition: ${spec.condition}`);
      return false;
  }
}

function getEffectiveCost(card: CardInstance): number {
  if (Number.isFinite(card.effectiveCost)) return card.effectiveCost!;
  const base = parseInt(card?.cost as string, 10) || 0;
  const mod = parseInt((card as any)?.cost_mod, 10) || 0;
  return base + mod;
}
