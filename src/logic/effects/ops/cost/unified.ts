import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../../core/types/index.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import {
  trySetPendingTarget,
  reportSelectFizzled,
} from "../../../core/pendingTarget/index.js";
import { resolveDynamicValue } from "../../../core/values.js";
import type { UnifiedCostSpec } from "./types.js";

import { normalizeToCostSpec } from "./types.js";
import { applyCostChangeToCard } from "./model.js";
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
      if (
        spec.filter?.type &&
        c.type?.toLowerCase() !== spec.filter.type.toLowerCase()
      )
        return false;
      if (spec.filter?.class && c.class !== spec.filter.class) return false;
      if (
        spec.filter?.tribe &&
        (!Array.isArray(c.tribes) || !c.tribes.includes(spec.filter.tribe))
      )
        return false;
      if (
        spec.filter?.name &&
        String(c.name ?? "").toLowerCase() !==
          String(spec.filter.name).toLowerCase()
      )
        return false;
      return true;
    });
  }

  // Handle selection if required
  if (spec.select && spec.select > 0) {
    if (targets.length === 0) {
      reportSelectFizzled({
        eff: eff as Effect,
        owner,
        sourceCard,
        target: spec.target,
      });
      return "done";
    }

    const selectCount = Math.min(spec.select, targets.length);

    if (
      trySetPendingTarget({
        eff: eff as any,
        owner,
        sourceCard,
        resumeEffects: context?.queue || [],
        pool: targets,
        targets: [],
        selectCount,
      }) === "fizzled"
    ) {
      return "done";
    }

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

    case "last_added_to_hand": {
      const last = (state as any).lastAddedToHand;
      return last ? [last] : [];
    }

    default:
      return [];
  }
}

/** Apply cost change to a single card (shared by unified + targeted handlers). */
export function applyCostChange(
  card: CardInstance,
  spec: UnifiedCostSpec,
  amount: number,
): void {
  applyCostChangeToCard(card, spec, amount);
}
