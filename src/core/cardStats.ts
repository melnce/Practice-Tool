/**
 * @file Card Stats Utilities
 * 
 * DESIGN: Single place for stat coercion and manipulation.
 * All card stats (attack, defense, cost) must be numbers.
 * Use these utilities at card creation/parsing boundaries.
 */

import type { CardInstance } from "./types/index.js";

// ============================================================================
// TYPE COERCION - Use at parsing boundaries ONLY
// ============================================================================

/**
 * Safely coerce any value to a number.
 * Use at card creation/JSON parsing boundary.
 */
export function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}

/**
 * Normalize card stats to numbers.
 * Call once at card creation (in initFollower/initAmulet).
 */
export function normalizeCardStats(card: CardInstance): void {
    card.attack = toNumber(card.attack);
    card.defense = toNumber(card.defense);
    card.cost = toNumber(card.cost);

    // Base stats for tracking original values
    if (card.base_attack === undefined) card.base_attack = card.attack;
    if (card.base_defense === undefined) card.base_defense = card.defense;
}

// ============================================================================
// STAT ACCESSORS - Use these instead of direct property access
// ============================================================================

/**
 * Get attack value (guaranteed number).
 * For already-initialized cards, this is safe.
 * For uninitialized cards, use toNumber.
 */
export function getAttack(card: CardInstance): number {
    return card.attack as number;
}

/**
 * Get defense value (guaranteed number).
 */
export function getDefense(card: CardInstance): number {
    return card.defense as number;
}

/**
 * Get cost value (guaranteed number).
 */
export function getCost(card: CardInstance): number {
    return card.cost as number;
}

// ============================================================================
// STAT MODIFIERS - Safe arithmetic
// ============================================================================

/**
 * Add to attack. Clamps to minimum 0.
 */
export function addAttack(card: CardInstance, amount: number): void {
    card.attack = Math.max(0, getAttack(card) + amount);
}

/**
 * Add to defense. Does not clamp (can be negative for death check).
 */
export function addDefense(card: CardInstance, amount: number): void {
    card.defense = getDefense(card) + amount;
}

/**
 * Set attack directly.
 */
export function setAttack(card: CardInstance, value: number): void {
    card.attack = Math.max(0, value);
}

/**
 * Set defense directly.
 */
export function setDefense(card: CardInstance, value: number): void {
    card.defense = value;
}














