// src/logic/effects/ops/summon/handlers.ts
// Source-specific summon handlers - separated for modularity

import { state } from "../../../../core/gameState.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";
import { logEvent } from "../../../../core/logger.js";
import { getPool } from "../../../core/targeting.js";
import { runEffects } from "../../../core/effects/index.js";
import { finishFollowerEnter } from "../summon_ops/core.js";

import type { UnifiedSummonSpec, SummonContext } from "./types.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import {
  summonNamed,
  summonExactCopy,
  summonRandomFromDeck,
  handleReanimate,
} from "./primitives.js";

// Import specialized handlers
import {
  handleSelectHandSummonArtifactCopy,
  handleSelectHandSummonArtifactCopiesEOT,
  handleSelectHandSummonFollower,
} from "../summon_ops/hand.js";
import { handleSummonDestroyedAmuletHighestBaseCost } from "../summon_ops/graveyard.js";

// =============================================================================
// NAMED SUMMON
// =============================================================================

export function handleSummonNamed(
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

// =============================================================================
// COPY SUMMON
// =============================================================================

export function handleSummonCopy(
  spec: UnifiedSummonSpec,
  owner: Player,
  context: SummonContext,
  eff: Effect & Record<string, any>,
  effectsQueue: Effect[] = [],
): void {
  let targets: CardInstance[] = [];

  if (spec.copy_scope === "self" && context.sourceCard) {
    targets = [context.sourceCard];
  } else if (context.targetUids?.length) {
    // UID-based selection only
    targets = resolveUids(context.targetUids);
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

  const thenSteps = Array.isArray(eff.then) ? eff.then : [];

  for (const target of targets) {
    if (!target) continue;
    for (let i = 0; i < spec.count; i++) {
      const clone = summonExactCopy(target, owner, {
        deferEnter: !!thenSteps.length,
      });
      if (!clone) continue;
      if (thenSteps.length) {
        state.lastSummoned = [clone];
        runEffects(structuredClone(thenSteps) as Effect[], owner, clone);
      }
      finishFollowerEnter(clone, owner);
    }
  }
}

// =============================================================================
// DECK SUMMON
// =============================================================================

export function handleSummonFromDeck(eff: Effect, owner: Player): void {
  summonRandomFromDeck(eff, owner);
}

// =============================================================================
// HAND SUMMON
// =============================================================================

export function handleSummonFromHand(
  eff: Effect & Record<string, any>,
  owner: Player,
  context: SummonContext,
  effectsQueue: Effect[] = [],
): string | void {
  const isArtifact = eff.filter?.type === "Artifact";
  const isFollowerHand =
    eff.filter?.type === "Follower" ||
    String(eff.target || "").includes("hand:follower");

  if (isFollowerHand && (eff.select || eff.select_count)) {
    return handleSelectHandSummonFollower(
      eff,
      owner,
      context.sourceCard,
      effectsQueue,
    );
  }

  if (eff.mode === "copy" || !eff.mode) {
    if (isArtifact) {
      if (eff.eot_destroy) {
        handleSelectHandSummonArtifactCopiesEOT(eff, owner, effectsQueue);
        return "pending";
      } else {
        handleSelectHandSummonArtifactCopy(eff, owner, effectsQueue);
        return "pending";
      }
    }
  }

  logEvent("summon_hand_unhandled", { mode: eff.mode, filter: eff.filter });
}

// =============================================================================
// GRAVEYARD SUMMON (REANIMATE)
// =============================================================================

export function handleReanimateWrapper(
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
