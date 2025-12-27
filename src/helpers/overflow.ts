// src/helpers/overflow.ts
import { state } from "../core/gameState.js";
import type { Player } from "../core/types/index.js";

/**
 * Check if player has Overflow active.
 * Overflow is ON when max PP is at least 7 (temp +1 for second player doesn't count).
 * 
 * @param owner - Player slot (accepts both legacy "blue"/"red" and new "first"/"second")
 */
export function isOverflow(owner: Player): boolean {
  // Map to internal state keys
  const isFirst = owner === "first";

  const max = isFirst
    ? state.players.first.maxPP
    : state.players.second.maxPP;

  return Number(max) >= 7;
}














