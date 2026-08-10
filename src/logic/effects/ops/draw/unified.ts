// src/logic/effects/ops/draw/unified.ts
// Draw handler - deck only, thins deck.
// For token generation, use "add" op
// For card duplication, use "copy" op

import { state } from "../../../../core/gameState.js";
import { drawCard } from "../../../../core/utils.js";
import { logEvent } from "../../../../core/logger.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";

import type { UnifiedDrawSpec, DrawCount } from "./types.js";

import { normalizeToUnifiedSpec } from "./types.js";
// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getHand(player: Player): CardInstance[] {
  return state.players[player].hand;
}

function getDeck(player: Player): CardInstance[] {
  return state.players[player].deck;
}

function getComboCount(player: Player): number {
  return (state as any).turnData?.[player]?.cardsPlayedThisTurn ?? 0;
}

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified draw handler - deck only.
 *
 * Semantic: Stochastic card acquisition from deck. Thins deck.
 * For token generation, use "add" op.
 * For card duplication, use "copy" op.
 *
 * @param eff - The draw effect from card JSON
 * @param owner - The player who triggered the effect
 */
export function handleDraw(
  eff: Effect & Record<string, any>,
  owner: Player,
): void {
  const spec = normalizeToUnifiedSpec(eff);

  // Determine who draws
  const drawingPlayer: Player =
    spec.player === "opponent"
      ? owner === "first"
        ? "second"
        : "first"
      : owner;

  const hand = getHand(drawingPlayer);
  const deck = getDeck(drawingPlayer);

  // Resolve count
  const count = resolveCount(spec.count, drawingPlayer);
  if (count <= 0) return;

  // Execute draw
  logEvent("draw", { owner: drawingPlayer, count });
  for (let i = 0; i < count; i++) {
    drawCard(hand, deck, drawingPlayer);
  }
}

// ============================================================================
// INTERNAL: COUNT RESOLUTION
// ============================================================================

function resolveCount(count: DrawCount, player: Player): number {
  if (count === "combo") {
    return getComboCount(player);
  }
  if (count === "all") {
    return 999; // Handled by deck size naturally
  }
  return typeof count === "number" ? count : 1;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { normalizeToUnifiedSpec, UnifiedDrawSpec } from "./types.js";
