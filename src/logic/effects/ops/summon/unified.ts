// src/logic/effects/ops/summon/unified.ts
// Unified summon handler - thin router delegating to specialized handlers

import type { Effect, Player } from "../../../../core/types/index.js";
import { logEvent } from "../../../../core/logger.js";

import type { SummonContext } from "./types.js";

import { normalizeToUnifiedSpec } from "./types.js";
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
  console.log("[SUMMON UNIFIED] handleSummon called", { eff, owner });
  let spec;
  try {
    spec = normalizeToUnifiedSpec(eff);
    console.log("[SUMMON UNIFIED] normalized spec", { spec });
  } catch (e) {
    console.error("[SUMMON UNIFIED] normalizeToUnifiedSpec threw:", e);
    return;
  }

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
  console.log("[SUMMON UNIFIED] routing to source:", spec.source);
  switch (spec.source) {
    case "named":
      handleSummonNamed(eff, spec, targetOwner);
      break;

    case "copy":
      handleSummonCopy(spec, targetOwner, context, eff, _effectsQueue);
      break;

    case "deck":
      handleSummonFromDeck(eff, targetOwner);
      break;

    case "hand":
      return handleSummonFromHand(eff, targetOwner, context, _effectsQueue);

    case "graveyard":
      console.log("[SUMMON UNIFIED] calling handleReanimateWrapper");
      handleReanimateWrapper(eff, targetOwner);
      break;

    default:
      logEvent("summon_unknown_source", { source: spec.source });
  }
}
