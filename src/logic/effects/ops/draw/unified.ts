// src/logic/effects/ops/draw/unified.ts
// Unified draw handler - single entry point for all draw operations.

import { state } from "../../../../core/gameState.js";
import { drawCard } from "../../../../core/utils.js";
import { logEvent } from "../../../../core/logger.js";
import { Effect, Player, CardInstance } from "../../../../core/types.js";
import {
  normalizeCardFilter,
  buildCardPredicate,
} from "../../../core/cardFilter/index.js";

import { UnifiedDrawSpec, normalizeToUnifiedSpec } from "./types.js";
import {
  getDeck,
  getHand,
  removeFromDeck,
  moveToHand,
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
  const spec = normalizeToUnifiedSpec(eff);

  // Determine who draws
  const drawingPlayer: Player =
    spec.player === "opponent" ? (owner === "blue" ? "red" : "blue") : owner;

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
      if (spec.filters) {
        drawFiltered(deck, hand, spec, count, drawingPlayer);
      } else {
        drawSimple(deck, hand, count, drawingPlayer);
      }
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

    const copy = JSON.parse(JSON.stringify(base));
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
// INTERNAL: FILTERED DRAW (with filters)
// ============================================================================

/**
 * Filtered draw - search deck for matching cards.
 * Respects mode (topmost/random) and applies keywords.
 */
function drawFiltered(
  deck: CardInstance[],
  hand: CardInstance[],
  spec: UnifiedDrawSpec,
  count: number,
  player: Player,
): void {
  const normalizedFilter = normalizeCardFilter(spec.filters!);
  const matches = buildCardPredicate(normalizedFilter);

  // Find all matching indices (0 = bottom, high = top)
  const matchingIndices: number[] = [];
  for (let i = 0; i < deck.length; i++) {
    const card = deck[i];
    if (card && matches(card)) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 0) return;

  // Determine how many to draw
  const want =
    spec.count === "all"
      ? matchingIndices.length
      : Math.min(count, matchingIndices.length);
  if (want <= 0) return;

  // Select indices based on mode
  let selectedIndices: number[];
  if (spec.mode === "random") {
    selectedIndices = shuffleAndTake(matchingIndices, want);
  } else {
    // Topmost = highest indices first
    selectedIndices = matchingIndices
      .sort((a, b) => b - a) // Descending (top first)
      .slice(0, want);
  }

  // Sort descending for removal (remove highest first to maintain indices)
  selectedIndices.sort((a, b) => b - a);

  // Draw selected cards
  for (const idx of selectedIndices) {
    if (hand.length >= 9) break; // MAX_HAND

    const card = removeFromDeck(deck, idx);
    if (!card) continue;

    // Apply keywords if specified
    if (spec.keywords.length > 0) {
      applyKeywords(card, spec.keywords);
    }

    trackLastDrawn(card);
    if (!moveToHand(hand, card)) break;
  }

  logEvent("draw", {
    owner: player,
    mode: spec.mode,
    filtered: true,
    moved: selectedIndices.length,
    keywords: spec.keywords.length > 0 ? spec.keywords : undefined,
  });
}

// ============================================================================
// INTERNAL: SHUFFLE HELPER
// ============================================================================

function shuffleAndTake(indices: number[], want: number): number[] {
  // Fisher-Yates shuffle
  const arr = [...indices];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = state.rng.nextInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, want).sort((a, b) => b - a);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { normalizeToUnifiedSpec, UnifiedDrawSpec } from "./types.js";
