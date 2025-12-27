import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type { CardInstance, Player, Effect } from "../../../../core/types/index.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import { resolveDynamicValue } from "../../../core/values.js";
import type { UnifiedCostSpec } from "./types.js";

import { normalizeToCostSpec } from "./types.js";
import { opponentOf, getHand } from "../../../../core/playerHelpers.js";
import { resolveUids } from "../../../../core/uidResolver.js";

/**
 * Unified cost handler - handles all cost modification variants.
 * Replaces 6 legacy cost handlers.
 */
export function handleCost(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any = {},
): "done" | "pending" {
  const spec = normalizeToCostSpec(eff);

  // If we're resuming after selection, use selected targets
  if (context?.targetUids?.length && spec.select) {
    const targets = resolveUids(context.targetUids);
    const amount = resolveDynamicValue(spec.amount, {
      owner,
      sourceCard,
      ...context,
    });

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

  let targets = resolveTargets(spec, owner, sourceCard, context);

  // Apply filter if specified
  if (spec.filter && targets.length > 0) {
    targets = targets.filter((c) => {
      if (spec.filter?.type && c.type?.toLowerCase() !== spec.filter.type.toLowerCase()) return false;
      if (spec.filter?.class && c.class !== spec.filter.class) return false;
      if (spec.filter?.tribe && (!Array.isArray(c.tribes) || !c.tribes.includes(spec.filter.tribe))) return false;
      return true;
    });
  }

  // Handle selection if required
  if (spec.select && spec.select > 0 && targets.length > 0) {
    const selectCount = Math.min(spec.select, targets.length);

    setPendingTarget({
      eff: eff as any,
      owner,
      sourceCard,
      resumeEffects: context?.queue || [],
      pool: targets,
      targets: [],
      selectCount,
    });

    highlightSelectable(targets);
    logEvent("cost_select", {
      owner,
      pool: targets.length,
      select: selectCount,
    });
    return "pending";
  }

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
      // UID-based selection only
      if (context?.targetUids?.length) {
        return resolveUids(context.targetUids);
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
      const opponent = opponentOf(owner);
      return getHand(state, opponent);
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















