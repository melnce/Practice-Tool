// src/logic/effects/ops/destroy/primitives.ts
// Low-level destroy operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { Player, CardInstance } from "../../../../core/types.js";
import { runEffects } from "../../../core/effects/index.js";
import { getBoard as getBoardHelper, getGraveyard as getGraveyardHelper, addShadows } from "../../../../core/playerHelpers.js";

// ============================================================================
// PROTECTION CHECKS
// ============================================================================

/**
 * Check if card is on owner's board.
 */
export function isAlly(card: CardInstance, owner: Player): boolean {
  const board = getBoardHelper(state, owner);
  return board?.includes(card) ?? false;
}

/**
 * Check if it's the owner's turn.
 */
export function isOwnTurn(owner: Player): boolean {
  return state.activePlayer === owner;
}

/**
 * Check if card has super-evolve protection.
 * Super-evolved allies cannot be destroyed on owner's turn.
 */
export function isSuperProtected(card: CardInstance, owner: Player): boolean {
  return !!(
    card &&
    card.type === "Follower" &&
    card.evoType === "super" &&
    isOwnTurn(owner) &&
    isAlly(card, owner)
  );
}

/**
 * Check if card can be destroyed (not protected).
 */
export function canBeDestroyed(card: CardInstance, owner: Player): boolean {
  if (!card) return false;
  if (card.keywordState?.cannotBeDestroyed) return false;
  if (isSuperProtected(card, owner)) return false;
  return true;
}

/**
 * Infer owner from board position.
 */
export function inferCardOwner(card: CardInstance): Player | null {
  if (getBoardHelper(state, "first").includes(card)) return "first";
  if (getBoardHelper(state, "second").includes(card)) return "second";
  return null;
}

// ============================================================================
// CORE DESTROY PRIMITIVE
// ============================================================================

/**
 * Destroy a single target. Handles both followers and amulets.
 *
 * - Followers: Set defense to 0 (cleanup handles actual removal)
 * - Amulets: Move to graveyard + fire Last Words
 *
 * @returns true if destroyed, false if protected/invalid
 */
export function destroyTarget(
  target: CardInstance,
  owner: Player,
  reason: string = "destroy",
): boolean {
  if (!target) return false;

  const cardOwner = inferCardOwner(target) ?? owner;

  // Protection checks
  if (!canBeDestroyed(target, cardOwner)) {
    return false;
  }

  logEvent("destroy", {
    target: target.name,
    uid: target.uid,
    type: target.type,
    reason,
  });

  // Follower destroy
  if (target.type === "Follower") {
    target.defense = 0;
    return true;
  }

  // Amulet destroy - move to graveyard + Last Words
  if (target.type === "Amulet") {
    const board = getBoardHelper(state, cardOwner);
    const grave = getGraveyardHelper(state, cardOwner);
    const idx = board.indexOf(target);

    if (idx === -1) return false;

    const removed = board.splice(idx, 1)[0];
    if (!removed) return false;

    removed.zone = "graveyard";
    grave.push(removed);

    // Add shadow
    addShadows(state, cardOwner, 1);

    // Fire Last Words
    fireLastWords(removed, cardOwner);
    return true;
  }

  return false;
}

/**
 * Fire Last Words effects for a card.
 */
export function fireLastWords(card: CardInstance, owner: Player): void {
  const lw =
    card.keywordState?.lastWordsEffects || (card as any).lastWordsEffects;
  if (card.hasLastWords && Array.isArray(lw) && lw.length > 0) {
    runEffects([...lw], owner, card);
  }
}

// ============================================================================
// BOARD ACCESS
// ============================================================================

export function getBoard(owner: Player): CardInstance[] {
  return getBoardHelper(state, owner);
}

export function getGraveyard(owner: Player): CardInstance[] {
  return getGraveyardHelper(state, owner);
}















