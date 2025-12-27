// src/helpers/necromancy.ts
import { state } from "../core/gameState.js";
import type { Player } from "../core/types/index.js";

/**
 * Check if player has enough shadows for necromancy cost.
 * @param owner - Player slot (accepts both legacy and new format)
 */
export function hasNecromancy(owner: Player, cost: number = 1): boolean {
  const isFirst = owner === "first";
  const shadows = isFirst ? state.players.first.shadows : state.players.second.shadows;
  return shadows >= cost;
}

/**
 * Spend shadows for necromancy cost.
 * @param owner - Player slot (accepts both legacy and new format)
 */
export function spendShadows(owner: Player, cost: number = 1): void {
  const isFirst = owner === "first";
  if (isFirst) {
    state.players.first.shadows = Math.max(0, state.players.first.shadows - cost);
  } else {
    state.players.second.shadows = Math.max(0, state.players.second.shadows - cost);
  }
}














