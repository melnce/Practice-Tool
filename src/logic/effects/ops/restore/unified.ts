// src/logic/effects/ops/restore/unified.ts
// Unified restore handler - single entry point for all restore/heal operations.

import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";
import { logEvent } from "../../../../core/logger.js";

import type { UnifiedRestoreSpec, RestoreContext } from "./types.js";

import { normalizeToUnifiedSpec } from "./types.js";
import {
  restoreLeaderHP,
  restoreFollowerToFull,
  restoreFollowerByAmount,
  getAlliedFollowers,
  getHandSize,
} from "./primitives.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified restore handler.
 * Routes all restore/heal operations through normalized spec.
 *
 * @returns amount restored
 */
export function handleRestore(
  eff: Effect & Record<string, any>,
  owner: Player,
  _effectsQueue: Effect[] = [],
  context: RestoreContext = { owner, sourceCard: null },
): number {
  const spec = normalizeToUnifiedSpec(eff);

  // Resolve target player
  const targetPlayer: Player =
    spec.player === "opponent"
      ? owner === "first"
        ? "second"
        : "first"
      : owner;

  // Resolve amount
  const amount = resolveAmount(spec, targetPlayer, context);

  // Dispatch by target
  let restored: number;
  switch (spec.target) {
    case "leader":
      restored = handleRestoreLeader(targetPlayer, amount);
      break;

    case "self":
      restored = handleRestoreSelf(context.sourceCard, amount, spec);
      break;

    case "allies":
      restored = handleRestoreAllies(targetPlayer, amount);
      break;

    case "followers":
      restored = handleRestoreFollowers(targetPlayer, amount);
      break;

    default:
      logEvent("restore_unknown_target", { target: spec.target });
      restored = 0;
  }

  // Store in context for chaining
  if (spec.store_restored_as && restored > 0) {
    storeInContext(context, spec.store_restored_as, restored);
  }

  return restored;
}

// ============================================================================
// TARGET HANDLERS
// ============================================================================

function handleRestoreLeader(player: Player, amount: number): number {
  if (amount <= 0) return 0;
  return restoreLeaderHP(player, amount);
}

function handleRestoreSelf(
  sourceCard: CardInstance | null,
  amount: number,
  spec: UnifiedRestoreSpec,
): number {
  if (!sourceCard) return 0;

  if (spec.amount_source === "full") {
    return restoreFollowerToFull(sourceCard);
  } else {
    return restoreFollowerByAmount(sourceCard, amount);
  }
}

function handleRestoreAllies(owner: Player, amount: number): number {
  // Heal leader
  let totalRestored = restoreLeaderHP(owner, amount);

  // Heal all allied followers
  const followers = getAlliedFollowers(owner);
  for (const follower of followers) {
    totalRestored += restoreFollowerByAmount(follower, amount);
  }

  return totalRestored;
}

function handleRestoreFollowers(owner: Player, amount: number): number {
  // Heal all allied followers (NOT leader)
  let totalRestored = 0;
  const followers = getAlliedFollowers(owner);
  for (const follower of followers) {
    totalRestored += restoreFollowerByAmount(follower, amount);
  }
  return totalRestored;
}

// ============================================================================
// AMOUNT RESOLUTION
// ============================================================================

function resolveAmount(
  spec: UnifiedRestoreSpec,
  player: Player,
  context: RestoreContext,
): number {
  const src = spec.amount_source;

  // Context variable: "context.variable_name"
  if (src.startsWith("context.")) {
    const varName = src.slice("context.".length);
    const val = context[varName];
    if (typeof val === "number" && Number.isFinite(val)) {
      return val;
    }
    console.warn(
      `[restore] Missing context variable: ${varName}, defaulting to 0`,
    );
    return 0;
  }

  switch (src) {
    case "hand_size":
      return getHandSize(player);

    case "full":
      // "full" is handled per-target, return 0 here
      return 0;

    case "fixed":
    default:
      return spec.amount;
  }
}

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

function storeInContext(
  context: RestoreContext,
  variableName: string,
  value: number,
): void {
  context[variableName] = value;
  logEvent("restore_store_variable", { variable: variableName, value });
}
