// src/logic/effects/ops/banish/primitives.ts
// Low-level banish operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { fireTrigger } from "../../../core/triggers.js";
import { CardInstance, Player } from "../../../../core/types.js";
import { getBoard as getPlayerBoard, getDeck, getBanish } from "../../../../core/playerHelpers.js";

// ============================================================================
// CORE PRIMITIVES
// ============================================================================

/**
 * Banish a single card from its current zone.
 * Fires ally_follower_leaves_field and enemy_follower_leaves_field triggers.
 * @returns true if card was banished
 */
export function banishCard(
  card: CardInstance,
  reason: string = "effect",
): boolean {
  if (!card) return false;

  // Try first player's board
  const firstBoard = getPlayerBoard(state, "first");
  const bi = firstBoard.indexOf(card);
  if (bi !== -1) {
    firstBoard.splice(bi, 1);
    // Fire ally trigger for first, enemy trigger for second
    fireTrigger("ally_follower_leaves_field", "first");
    fireTrigger("enemy_follower_leaves_field", "second");
    logEvent("banish", {
      card: card.name,
      uid: card.uid,
      owner: "first",
      reason,
    });
    moveToBanishZone(card, "first");
    return true;
  }

  // Try second player's board
  const secondBoard = getPlayerBoard(state, "second");
  const ri = secondBoard.indexOf(card);
  if (ri !== -1) {
    secondBoard.splice(ri, 1);
    // Fire ally trigger for second, enemy trigger for first
    fireTrigger("ally_follower_leaves_field", "second");
    fireTrigger("enemy_follower_leaves_field", "first");
    logEvent("banish", {
      card: card.name,
      uid: card.uid,
      owner: "second",
      reason,
    });
    moveToBanishZone(card, "second");
    return true;
  }

  return false;
}

/**
 * Banish source card (self-banish).
 */
export function banishSelf(sourceCard: CardInstance | null): boolean {
  if (!sourceCard) return false;
  return banishCard(sourceCard, "self");
}

/**
 * Move card to banish zone if it exists.
 */
function moveToBanishZone(card: CardInstance, owner: Player): void {
  const bzone = getBanish(state, owner);
  if (Array.isArray(bzone)) {
    bzone.push(card);
  }
}

// ============================================================================
// DECK OPERATIONS
// ============================================================================

/**
 * Get deck and banish zone for an owner.
 */
function getDeckAndBanish(
  owner: Player,
): [CardInstance[], CardInstance[] | null] {
  const deck = getDeck(state, owner);
  const bzone = getBanish(state, owner);
  return [Array.isArray(deck) ? deck : [], Array.isArray(bzone) ? bzone : null];
}

/**
 * Banish all duplicate cards from owner's deck (keep first occurrence).
 * @returns count of cards banished
 */
export function banishDeckDuplicates(owner: Player): number {
  const [deck, bzone] = getDeckAndBanish(owner);
  if (!deck.length) return 0;

  const seen = new Set<string>();
  const kept: CardInstance[] = [];
  const removed: CardInstance[] = [];

  for (const card of deck) {
    const key = String(card?.name || "");
    if (!key) continue;
    if (seen.has(key)) {
      removed.push(card);
    } else {
      seen.add(key);
      kept.push(card);
    }
  }

  // Overwrite deck in place
  deck.length = 0;
  deck.push(...kept);
  logEvent("banishDuplicatesFromDeck", {
    owner,
    kept: kept.length,
    removed: removed.length,
  });

  // Move to banish zone if available
  if (bzone && removed.length) {
    bzone.push(...removed);
  }

  return removed.length;
}

/**
 * Banish all enemy cards with same name as selected card.
 * @returns count of cards banished
 */
export function banishAllEnemyCopies(
  owner: Player,
  selected: CardInstance | null,
): number {
  if (!selected || !selected.name) return 0;

  const oppBoard = getPlayerBoard(state, owner === "first" ? "second" : "first");
  const hits = oppBoard.filter((c) => c?.name === selected.name);

  let count = 0;
  for (const card of hits) {
    if (banishCard(card, "all_enemy_copies")) {
      count++;
    }
  }

  return count;
}

/**
 * Get owner of a board card.
 */
export function getCardOwner(card: CardInstance): Player | null {
  if (getPlayerBoard(state, "first").includes(card)) return "first";
  if (getPlayerBoard(state, "second").includes(card)) return "second";
  return null;
}

/**
 * Get board for owner.
 */
export function getBoard(owner: Player): CardInstance[] {
  return getPlayerBoard(state, owner);
}















