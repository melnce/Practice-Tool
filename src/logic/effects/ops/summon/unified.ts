// src/logic/effects/ops/summon/unified.ts
// Unified summon handler - single entry point for all summon operations.

import { Effect, Player, CardInstance } from "../../../../core/types.js";
import { logEvent } from "../../../../core/logger.js";
import { getPool } from "../../../core/targeting.js";

import {
  UnifiedSummonSpec,
  SummonContext,
  normalizeToUnifiedSpec,
} from "./types.js";
import {
  summonNamed,
  summonExactCopy,
  summonRandomFromDeck,
  handleReanimate,
} from "./primitives.js";

// Import specialized handlers for routing
import { handleFillBoardChainDecay } from "../summon_ops/chain.js";
import {
  handleSelectHandSummonArtifactCopy,
  handleSelectHandSummonArtifactCopiesEOT,
} from "../summon_ops/hand.js";
import { handleSummonDestroyedAmuletHighestBaseCost } from "../summon_ops/graveyard.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified summon handler.
 * Routes all summon operations through normalized spec.
 *
 * @returns array of summoned card instances
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
    spec.owner === "enemy" ? (owner === "blue" ? "red" : "blue") : owner;

  // ========================================================================
  // MODE-BASED ROUTING (takes precedence)
  // ========================================================================
  if (eff.mode === "chain_fill") {
    // Fill board with chain decay copies
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
      // Select from hand and summon copy
      return handleSummonFromHand(eff, targetOwner, context);

    case "graveyard":
      // Reanimate from graveyard (includes "destroyed this match" effects)
      handleReanimateWrapper(eff, targetOwner);
      break;

    default:
      logEvent("summon_unknown_source", { source: spec.source });
  }
}

// ============================================================================
// SOURCE HANDLERS
// ============================================================================

function handleSummonNamed(
  eff: Effect,
  spec: UnifiedSummonSpec,
  owner: Player,
): void {
  const effWithCount = {
    ...eff,
    name: spec.name,
    count: spec.count,
  } as any;
  summonNamed(effWithCount, owner);
}

function handleSummonCopy(
  spec: UnifiedSummonSpec,
  owner: Player,
  context: SummonContext,
  eff: Effect & Record<string, any>,
): void {
  let targets: CardInstance[] = [];

  if (spec.copy_scope === "self" && context.sourceCard) {
    targets = [context.sourceCard];
  } else if (context.targets?.length) {
    targets = context.targets;
  } else {
    // Try to get from targeting pool
    const pool = getPool(
      eff.target || "",
      owner,
      context.sourceCard,
      eff.condition,
      context,
    );
    targets = pool.filter((c) => c?.type === "Follower");
  }

  for (const target of targets) {
    if (!target) continue;
    for (let i = 0; i < spec.count; i++) {
      summonExactCopy(target, owner);
    }
  }
}

function handleSummonFromDeck(eff: Effect, owner: Player): void {
  summonRandomFromDeck(eff, owner);
}

function handleSummonFromHand(
  eff: Effect & Record<string, any>,
  owner: Player,
  context: SummonContext,
): string | void {
  // Route based on mode/flags
  if (eff.mode === "copy" || !eff.mode) {
    // Check for artifact filter (existing behavior)
    const isArtifact = eff.filter?.type === "Artifact";

    if (isArtifact) {
      if (eff.eot_destroy) {
        handleSelectHandSummonArtifactCopiesEOT(eff, owner, context.sourceCard);
        return "pending";
      } else {
        handleSelectHandSummonArtifactCopy(eff, owner, context.sourceCard);
        return "pending";
      }
    }
  }

  logEvent("summon_hand_unhandled", { mode: eff.mode, filter: eff.filter });
}

function handleReanimateWrapper(
  eff: Effect & Record<string, any>,
  owner: Player,
): void {
  // Check for amulet filter with sort (specialized behavior)
  if (eff.filter?.type === "Amulet" && eff.sort === "cost_desc") {
    handleSummonDestroyedAmuletHighestBaseCost(owner);
    return;
  }

  // Default reanimate behavior
  handleReanimate(eff, owner);
}
