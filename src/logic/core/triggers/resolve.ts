import type { CardInstance, Player } from "../../../core/types/index.js";
import { state } from "../../../core/gameState.js";
import {
  getBoard,
  getHand,
  getGraveyard,
} from "../../../core/playerHelpers.js";
import type { TriggerContext } from "./types.js";

// =============================================================================
// UID RESOLUTION HELPERS
// =============================================================================
// P0-2 FIX: Helpers to resolve UIDs to live card state.
// Use these instead of directly accessing context object refs.
// =============================================================================

/**
 * Find a card by UID across all zones for a specific player.
 * Returns null if the card no longer exists (was banished, etc).
 */
export function findCardByUid(
  uid: string,
  playerHint?: Player,
): CardInstance | null {
  if (!uid) return null;

  const searchPlayer = (p: Player): CardInstance | null => {
    // Search board first (most common)
    const board = getBoard(state, p);
    const onBoard = board.find((c: CardInstance) => c?.uid === uid);
    if (onBoard) return onBoard;

    // Search hand
    const hand = getHand(state, p);
    const inHand = hand.find((c: CardInstance) => c?.uid === uid);
    if (inHand) return inHand;

    // Search graveyard (for last-known-info scenarios)
    const grave = getGraveyard(state, p);
    const inGrave = grave.find((c: CardInstance) => c?.uid === uid);
    if (inGrave) return inGrave;

    return null;
  };

  // If player hint provided, search that player first
  if (playerHint) {
    const found = searchPlayer(playerHint);
    if (found) return found;
    // Fall through to opponent
    const opponent = playerHint === "first" ? "second" : "first";
    return searchPlayer(opponent);
  }

  // No hint - search both players
  return searchPlayer("first") || searchPlayer("second");
}

/**
 * Resolve a context card by preferring the UID field over the object ref.
 * This ensures we get the current state of the card, not a stale snapshot.
 *
 * @param context - The trigger context
 * @param field - The field name (e.g., "attacker", "defender")
 * @param playerHint - Optional player hint for faster resolution
 * @returns The current card state, or null if not found
 */
export function resolveContextCard(
  context: TriggerContext,
  field: keyof TriggerContext,
  playerHint?: Player,
): CardInstance | null {
  const uidField = `${String(field)}Uid` as keyof TriggerContext;
  const uid = context[uidField] as string | undefined;

  // Prefer UID-based resolution
  if (uid) {
    return findCardByUid(uid, playerHint);
  }

  // Fall back to object ref (legacy path)
  const objRef = context[field] as CardInstance | undefined;
  if (objRef?.uid) {
    // Even with object ref, try to get fresh state
    return findCardByUid(objRef.uid, playerHint);
  }

  return objRef ?? null;
}

/**
 * Enrich context by adding UID fields from object refs.
 * Call this at emission site to ensure UIDs are always present.
 */
export function enrichContextWithUids(context: TriggerContext): TriggerContext {
  const cardFields = [
    "initiator",
    "enteringCard",
    "invokedCard",
    "target",
    "damagedCard",
    "attacker",
    "defender",
    "playedCard",
    "leavingCard",
    "destroyedCard",
  ] as const;

  for (const field of cardFields) {
    const uidField = `${field}Uid` as keyof TriggerContext;
    const objRef = context[field] as CardInstance | undefined;

    // Only set UID if not already present and object ref has uid
    if (!context[uidField] && objRef?.uid) {
      (context as any)[uidField] = objRef.uid;
    }
  }

  return context;
}
