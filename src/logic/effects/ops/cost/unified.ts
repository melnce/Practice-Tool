// src/logic/effects/ops/cost/unified.ts

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player, Effect } from "../../../../core/types.js";
import { getPool } from "../../../core/targeting.js";
import { resolveDynamicValue } from "../../../core/values.js";
import { UnifiedCostSpec, normalizeToCostSpec } from "./types.js";

/**
 * Unified cost handler - handles all cost modification variants.
 * Replaces 6 legacy cost handlers.
 */
export function handleCost(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any = {},
): "done" {
  const spec = normalizeToCostSpec(eff);
  const targets = resolveTargets(spec, owner, sourceCard, context);
  const amount = resolveDynamicValue(spec.amount, {
    owner,
    sourceCard,
    ...context,
  });

  if (!targets.length) return "done";

  for (const target of targets) {
    applyCostChange(target, spec, amount);
  }

  logEvent("costChange", {
    owner,
    mode: spec.mode,
    target: spec.target,
    amount,
    count: targets.length,
  });

  return "done";
}

/**
 * Resolve targets based on the cost spec.
 */
function resolveTargets(
  spec: UnifiedCostSpec,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any,
): CardInstance[] {
  switch (spec.target) {
    case "self":
      return sourceCard ? [sourceCard] : [];

    case "selected": {
      if (Array.isArray(context?.targets) && context.targets.length) {
        return context.targets;
      }
      if (context?.selectedCard) {
        return [context.selectedCard];
      }
      if (context?.targetCard) {
        return [context.targetCard];
      }
      return [];
    }

    case "pool": {
      const poolSpec = spec.pool || "ally:hand";
      return (
        getPool(poolSpec, owner, sourceCard, spec.condition, {
          isTargetedEffect: false,
        }) || []
      );
    }

    case "opponent_hand": {
      const opponent = owner === "blue" ? "red" : "blue";
      return opponent === "blue" ? state.blueHand : state.redHand;
    }

    case "last_drawn": {
      // Target the last drawn card (stored in state.lastDrawnCard)
      const lastDrawn = (state as any).lastDrawnCard;
      return lastDrawn ? [lastDrawn] : [];
    }

    default:
      return [];
  }
}

/**
 * Apply cost change to a single card.
 */
function applyCostChange(
  card: CardInstance,
  spec: UnifiedCostSpec,
  amount: number,
): void {
  if (!card) return;

  // Always track base cost
  if (card.base_cost === undefined) {
    card.base_cost = parseInt(String(card.cost)) || 0;
  }

  const currentCost = parseInt(String(card.cost)) || 0;
  const minCost = spec.min_cost ?? 0;

  switch (spec.mode) {
    case "reduce": {
      card.cost = Math.max(minCost, currentCost - amount);
      break;
    }

    case "set": {
      card.cost = Math.max(0, amount);
      break;
    }

    case "modify": {
      // Use cost_mod for additive modifier (can be positive or negative)
      card.cost_mod = (parseInt(String(card.cost_mod)) || 0) + amount;
      if (spec.until_eot) {
        card.temp_cost_mod_until_eot =
          (parseInt(String(card.temp_cost_mod_until_eot)) || 0) + amount;
      }
      break;
    }

    case "increase": {
      // Increase uses cost_mod for opponent hand increases
      card.cost_mod = (parseInt(String(card.cost_mod)) || 0) + amount;
      if (spec.until_eot) {
        card.temp_cost_mod_until_eot =
          (parseInt(String(card.temp_cost_mod_until_eot)) || 0) + amount;
      }
      break;
    }
  }
}
