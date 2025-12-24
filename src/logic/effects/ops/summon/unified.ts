// src/logic/effects/ops/summon/unified.ts
// Unified summon handler - thin router delegating to specialized handlers

import { Effect, Player } from "../../../../core/types.js";
import { logEvent } from "../../../../core/logger.js";

import { SummonContext, normalizeToUnifiedSpec } from "./types.js";
import { handleFillBoardChainDecay } from "../summon_ops/chain.js";
import {
  handleSummonNamed,
  handleSummonCopy,
  handleSummonFromDeck,
  handleSummonFromHand,
  handleReanimateWrapper,
} from "./handlers.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified summon handler.
 * Routes all summon operations through normalized spec.
 *
 * @returns "pending" if waiting for selection, void otherwise
 */
export function handleSummon(
  eff: Effect & Record<string, any>,
  owner: Player,
  _effectsQueue: Effect[] = [],
  context: SummonContext = { owner, sourceCard: null },
): string | void {
  const spec = normalizeToUnifiedSpec(eff);

  // Resolve target owner
  const targetOwner: Player =
    spec.owner === "enemy" ? (owner === "first" ? "second" : "first") : owner;

  // ========================================================================
  // MODE-BASED ROUTING (takes precedence)
  // ========================================================================
  if (eff.mode === "chain_fill") {
    handleFillBoardChainDecay(targetOwner, context.sourceCard || null);
    return;
  }

  // ========================================================================
  // SOURCE-BASED ROUTING
  // ========================================================================
  switch (spec.source) {
    case "named":
      handleSummonNamed(eff, spec, targetOwner);
      break;

    case "copy":
      handleSummonCopy(spec, targetOwner, context, eff);
      break;

    case "deck":
      handleSummonFromDeck(eff, targetOwner);
      break;

    case "hand":
      return handleSummonFromHand(eff, targetOwner, context);

    case "graveyard":
      handleReanimateWrapper(eff, targetOwner);
      break;

    default:
      logEvent("summon_unknown_source", { source: spec.source });
  }
}
















