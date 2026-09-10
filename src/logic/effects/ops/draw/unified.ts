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
import { resolveDynamicValue } from "../../../core/values.js";
import {
  normalizeCardFilter,
  buildCardPredicate,
} from "../../../core/cardFilter/index.js";

import type { UnifiedDrawSpec, DrawCount } from "./types.js";

import { normalizeToUnifiedSpec } from "./types.js";
import { bumpZoneVersion } from "../../../core/triggers/utils.js";
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

/**
 * Draw filtered cards from deck via seeded RNG (without replacement).
 * Moves each pick to the top of the deck then uses drawCard so overflow,
 * lastDrawn tracking, and ally_draw / when_drawn triggers stay consistent.
 */
function drawFiltered(
  drawingPlayer: Player,
  count: number,
  filters: Record<string, any>,
  distinctBy: string | null,
): number {
  const hand = getHand(drawingPlayer);
  const deck = getDeck(drawingPlayer);
  const predicate = buildCardPredicate(normalizeCardFilter(filters));
  const distinctNames = distinctBy?.toLowerCase() === "name";
  const seenNames = new Set<string>();
  let drawn = 0;

  for (let i = 0; i < count; i++) {
    const candidates: number[] = [];
    for (let idx = 0; idx < deck.length; idx++) {
      const card = deck[idx];
      if (!card || !predicate(card)) continue;
      if (distinctNames && seenNames.has(String(card.name))) continue;
      candidates.push(idx);
    }
    if (!candidates.length) break;

    const deckIdx = state.rng.pick(candidates)!;
    const card = deck[deckIdx];
    if (!card) break;

    if (distinctNames) seenNames.add(String(card.name));

    // Move chosen card to top of deck (end of array), then draw normally.
    if (deckIdx !== deck.length - 1) {
      deck.splice(deckIdx, 1);
      deck.push(card);
      bumpZoneVersion();
    }
    if (drawCard(hand, deck, drawingPlayer)) drawn++;
  }
  return drawn;
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
 * When filters are present, picks randomly among matching deck cards
 * (seeded RNG). Supports distinct_by: "name".
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

  if (spec.filters && Object.keys(spec.filters).length > 0) {
    const n = drawFiltered(
      drawingPlayer,
      count,
      spec.filters,
      spec.distinct_by,
    );
    logEvent("draw_filtered", {
      owner: drawingPlayer,
      count: n,
      filters: spec.filters,
      distinct_by: spec.distinct_by,
    });
    return;
  }

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
  if (typeof count === "string" && count.includes("{")) {
    return Math.max(0, resolveDynamicValue(count, { owner: player }) | 0);
  }
  return typeof count === "number" ? count : 1;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { normalizeToUnifiedSpec, UnifiedDrawSpec } from "./types.js";
