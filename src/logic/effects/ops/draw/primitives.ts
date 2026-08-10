// src/logic/effects/ops/draw/primitives.ts
// Low-level deck/hand operations for draw module.

import { state } from "../../../../core/gameState.js";
import { pushToHand, MAX_HAND } from "../../../../core/utils.js";
import { applyKeyword } from "../../../core/keywords.js";
import type { Player, CardInstance } from "../../../../core/types/index.js";
import {
  getDeck as getDeckHelper,
  getHand as getHandHelper,
  getPlaysThisTurn,
} from "../../../../core/playerHelpers.js";

// ============================================================================
// DECK OPERATIONS
// ============================================================================

/**
 * Remove card at index from deck. Mutates array.
 */
export function removeFromDeck(
  deck: CardInstance[],
  index: number,
): CardInstance | undefined {
  return deck.splice(index, 1)[0];
}

/**
 * Get deck for player.
 */
export function getDeck(player: Player): CardInstance[] {
  return getDeckHelper(state, player);
}

/**
 * Get hand for player.
 */
export function getHand(player: Player): CardInstance[] {
  return getHandHelper(state, player);
}

// ============================================================================
// MOVE TO HAND
// ============================================================================

/**
 * Move card to hand, respecting MAX_HAND.
 * Returns true if successful, false if hand full.
 */
export function moveToHand(hand: CardInstance[], card: CardInstance): boolean {
  if (hand.length >= MAX_HAND) return false;
  return pushToHand(hand, card);
}

// ============================================================================
// KEYWORD APPLICATION
// ============================================================================

/**
 * Apply array of keywords to a card.
 */
export function applyKeywords(card: CardInstance, keywords: string[]): void {
  for (const kw of keywords) {
    if (kw) applyKeyword(card, kw);
  }
}

// ============================================================================
// LAST DRAWN TRACKING
// ============================================================================

/**
 * Track last drawn card for UI/effects.
 * Maintains most recent first, max 5 entries.
 */
export function trackLastDrawn(card: CardInstance): void {
  if (state.lastDrawnCards) {
    state.lastDrawnCards.unshift(card);
    if (state.lastDrawnCards.length > 5) {
      state.lastDrawnCards.length = 5;
    }
  }
}

// ============================================================================
// COMBO HELPERS
// ============================================================================

/**
 * Get current combo count for player.
 */
export function getComboCount(player: Player): number {
  return getPlaysThisTurn(state, player);
}
