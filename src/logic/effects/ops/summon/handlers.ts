// src/logic/effects/ops/summon/handlers.ts
// Source-specific summon handlers - separated for modularity

import { Effect, Player, CardInstance } from "../../../../core/types.js";
import { logEvent } from "../../../../core/logger.js";
import { getPool } from "../../../core/targeting.js";

import { UnifiedSummonSpec, SummonContext } from "./types.js";
import {
    summonNamed,
    summonExactCopy,
    summonRandomFromDeck,
    handleReanimate,
} from "./primitives.js";

// Import specialized handlers
import { handleSelectHandSummonArtifactCopy, handleSelectHandSummonArtifactCopiesEOT } from "../summon_ops/hand.js";
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
