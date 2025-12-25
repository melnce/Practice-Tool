// src/logic/effects/ops/draw/unified.ts
// Unified draw handler - single entry point for all draw operations.

import { state } from "../../../../core/gameState.js";
import { drawCard } from "../../../../core/utils.js";
import { logEvent } from "../../../../core/logger.js";
import { Effect, Player, CardInstance } from "../../../../core/types/index.js";

import { UnifiedDrawSpec, normalizeToUnifiedSpec } from "./types.js";
import {
  getDeck,
  getHand,
  applyKeywords,
  trackLastDrawn,
  getComboCount,
} from "./primitives.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified draw handler.
 * Accepts canonical or legacy effect format and routes through normalized spec.
 *
 * This is the ONLY draw handler. All draw operations use this entry point.
 *
 * @param eff - The draw effect from card JSON
 * @param owner - The player who triggered the effect
 */
export function handleDraw(
  eff: Effect & Record<string, any>,
  owner: Player,
): void {
  // ========================================================================
  // MIGRATION GUARD: Draw no longer supports filters
  // Use "search" op for filtered deck searches (shuffles after)
  // ========================================================================
  if (eff.filters || eff.filter) {
    throw new Error(
      `[draw] MIGRATION REQUIRED: "draw" op no longer supports "filters". ` +
      `Use "search" op for filtered deck searches. ` +
      `Change { "op": "draw", "source": "deck", "filters": {...} } to { "op": "search", "filter": {...} }. ` +
      `Effect: ${JSON.stringify(eff)}`
    );
  }

  const spec = normalizeToUnifiedSpec(eff);

  // Determine who draws
  const drawingPlayer: Player =
    spec.player === "opponent" ? (owner === "first" ? "second" : "first") : owner;

  const hand = getHand(drawingPlayer);

  // Resolve count
  const count = resolveCount(spec.count, drawingPlayer);
  if (count <= 0) return;

  // ========================================================================
  // BRANCH BY SOURCE
  // ========================================================================
  switch (spec.source) {
    case "named":
      drawNamed(hand, spec.name, count, drawingPlayer, spec.keywords);
      break;

    case "deck":
    default: {
      const deck = getDeck(drawingPlayer);
      drawSimple(deck, hand, count, drawingPlayer);
      break;
    }
  }
}

// ============================================================================
// INTERNAL: COUNT RESOLUTION
// ============================================================================

function resolveCount(count: UnifiedDrawSpec["count"], player: Player): number {
  if (count === "combo") {
    return getComboCount(player);
  }
  if (count === "all") {
    // "all" is handled specially in filtered path - return large number here
    return 999;
  }
  return typeof count === "number" ? count : 1;
}

// ============================================================================
// INTERNAL: NAMED DRAW (token generation)
// ============================================================================

import { getCardDetails } from "../../../../data/cardDatabase.js";
import { pushToHand, MAX_HAND } from "../../../../core/utils.js";

/**
 * Add named card(s) to hand (token generation).
 * Creates new card instances from the card database.
 */
function drawNamed(
  hand: CardInstance[],
  name: string | null,
  count: number,
  player: Player,
  keywords: string[],
): void {
  if (!name) return;

  const base = getCardDetails(name);
  if (!base) {
    logEvent("drawNamed_notFound", { name, player });
    return;
  }

  for (let i = 0; i < count; i++) {
    if (hand.length >= MAX_HAND) break;

    const copy = structuredClone(base);
    copy.uid = state.rng.makeUid();

    // Apply keywords if specified
    if (keywords.length > 0) {
      applyKeywords(copy, keywords);
    }

    if (pushToHand(hand, copy)) {
      (state as any).lastAddedToHand = copy;
      trackLastDrawn(copy);
      logEvent("drawNamed", { owner: player, name: copy.name, uid: copy.uid });
    } else {
      break;
    }
  }
}

// ============================================================================
// INTERNAL: SIMPLE DRAW (no filters)
// ============================================================================

/**
 * Simple draw from top of deck.
 * Uses existing drawCard utility for deck-empty handling.
 */
function drawSimple(
  deck: CardInstance[],
  hand: CardInstance[],
  count: number,
  player: Player,
): void {
  logEvent("draw", { owner: player, count });

  for (let i = 0; i < count; i++) {
    drawCard(hand, deck, player);
  }
}



// ============================================================================
// EXPORTS
// ============================================================================

export { normalizeToUnifiedSpec, UnifiedDrawSpec } from "./types.js";















