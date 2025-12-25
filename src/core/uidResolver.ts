// src/core/uidResolver.ts
// UID-based card resolution utilities for deterministic targeting
// Phase 1 of UID-only targeting normalization

import { state } from "./gameState.js";
import type { CardInstance, Player } from "./types/index.js";
import { getHand, getBoard, getDeck, getGraveyard } from "./playerHelpers.js";

// =============================================================================
// CORE RESOLUTION
// =============================================================================

/**
 * Resolve a single UID to a CardInstance.
 * Searches all zones for both players.
 * 
 * @param uid - The unique identifier to resolve
 * @returns The card instance or null if not found
 */
export function resolveUid(uid: string): CardInstance | null {
    if (!uid) return null;

    // Search all zones for both players
    for (const player of ["first", "second"] as const) {
        // Check board first (most common for targeting)
        const board = getBoard(state, player);
        const onBoard = board.find(c => c?.uid === uid);
        if (onBoard) return onBoard;

        // Check hand
        const hand = getHand(state, player);
        const inHand = hand.find(c => c?.uid === uid);
        if (inHand) return inHand;

        // Check graveyard
        const graveyard = getGraveyard(state, player);
        const inGraveyard = graveyard.find(c => c?.uid === uid);
        if (inGraveyard) return inGraveyard;

        // Check deck (less common)
        const deck = getDeck(state, player);
        const inDeck = deck.find(c => c?.uid === uid);
        if (inDeck) return inDeck;
    }

    return null;
}

/**
 * Resolve multiple UIDs to CardInstances.
 * Filters out any UIDs that cannot be resolved.
 * 
 * @param uids - Array of unique identifiers
 * @returns Array of resolved card instances (may be shorter than input)
 */
export function resolveUids(uids: string[]): CardInstance[] {
    if (!uids || !Array.isArray(uids)) return [];

    const resolved: CardInstance[] = [];
    for (const uid of uids) {
        const card = resolveUid(uid);
        if (card) resolved.push(card);
    }
    return resolved;
}

/**
 * Strictly resolve UIDs - throws if any UID is not found.
 * Use when all UIDs must be valid (e.g., replay verification).
 * 
 * @param uids - Array of unique identifiers
 * @throws Error if any UID cannot be resolved
 */
export function resolveUidsStrict(uids: string[]): CardInstance[] {
    if (!uids || !Array.isArray(uids)) return [];

    const resolved: CardInstance[] = [];
    for (const uid of uids) {
        const card = resolveUid(uid);
        if (!card) {
            throw new Error(`[uidResolver] Failed to resolve UID: ${uid}`);
        }
        resolved.push(card);
    }
    return resolved;
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert CardInstance array to UID array.
 * Filters out cards without UIDs.
 * 
 * @param cards - Array of card instances
 * @returns Array of UIDs
 */
export function toUids(cards: CardInstance[]): string[] {
    if (!cards || !Array.isArray(cards)) return [];
    return cards
        .filter(c => c?.uid)
        .map(c => c.uid);
}

/**
 * Convert a single CardInstance to UID.
 * 
 * @param card - Card instance
 * @returns UID or empty string if no UID
 */
export function toUid(card: CardInstance | null | undefined): string {
    return card?.uid ?? "";
}

// =============================================================================
// ZONE-SPECIFIC RESOLUTION
// =============================================================================

/**
 * Resolve UID within a specific player's zones.
 * More efficient when player is known.
 */
export function resolveUidForPlayer(uid: string, player: Player): CardInstance | null {
    if (!uid) return null;

    const board = getBoard(state, player);
    const onBoard = board.find(c => c?.uid === uid);
    if (onBoard) return onBoard;

    const hand = getHand(state, player);
    const inHand = hand.find(c => c?.uid === uid);
    if (inHand) return inHand;

    const graveyard = getGraveyard(state, player);
    const inGraveyard = graveyard.find(c => c?.uid === uid);
    if (inGraveyard) return inGraveyard;

    const deck = getDeck(state, player);
    const inDeck = deck.find(c => c?.uid === uid);
    if (inDeck) return inDeck;

    return null;
}

/**
 * Resolve UID specifically on board (most common case).
 */
export function resolveUidOnBoard(uid: string): CardInstance | null {
    if (!uid) return null;

    for (const player of ["first", "second"] as const) {
        const board = getBoard(state, player);
        const found = board.find(c => c?.uid === uid);
        if (found) return found;
    }

    return null;
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Check if all UIDs can be resolved.
 * Useful for validation before operations.
 */
export function canResolveAll(uids: string[]): boolean {
    if (!uids || !Array.isArray(uids)) return true;
    return uids.every(uid => resolveUid(uid) !== null);
}

/**
 * Get list of UIDs that cannot be resolved.
 * Useful for debugging.
 */
export function getUnresolvableUids(uids: string[]): string[] {
    if (!uids || !Array.isArray(uids)) return [];
    return uids.filter(uid => resolveUid(uid) === null);
}
