// src/logic/effects/ops/banish/primitives.ts
// Low-level banish operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { fireTrigger } from "../../../core/triggers.js";
import { CardInstance, Player } from "../../../../core/types.js";

// ============================================================================
// CORE PRIMITIVES
// ============================================================================

/**
 * Banish a single card from its current zone.
 * Fires follower_leaves_field trigger if from board.
 * @returns true if card was banished
 */
export function banishCard(
  card: CardInstance,
  reason: string = "effect",
): boolean {
  if (!card) return false;

  // Try blue board
  const bi = state.blueBoard.indexOf(card);
  if (bi !== -1) {
    state.blueBoard.splice(bi, 1);
    fireTrigger("follower_leaves_field", "blue");
    logEvent("banish", {
      card: card.name,
      uid: card.uid,
      owner: "blue",
      reason,
    });
    moveToBanishZone(card, "blue");
    return true;
  }

  // Try red board
  const ri = state.redBoard.indexOf(card);
  if (ri !== -1) {
    state.redBoard.splice(ri, 1);
    fireTrigger("follower_leaves_field", "red");
    logEvent("banish", {
      card: card.name,
      uid: card.uid,
      owner: "red",
      reason,
    });
    moveToBanishZone(card, "red");
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
  const bzone = owner === "blue" ? state.blueBanish : state.redBanish;
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
  const deck = owner === "blue" ? state.blueDeck : state.redDeck;
  const bzone = owner === "blue" ? state.blueBanish : state.redBanish;
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

  const oppBoard = owner === "blue" ? state.redBoard : state.blueBoard;
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
  if (state.blueBoard.includes(card)) return "blue";
  if (state.redBoard.includes(card)) return "red";
  return null;
}

/**
 * Get board for owner.
 */
export function getBoard(owner: Player): CardInstance[] {
  return owner === "blue" ? state.blueBoard : state.redBoard;
}
