import type { GameState, Player } from "../../core/types/index.js";

/** Record a played card's printed base cost for ladder-style conditions. */
export function recordPlayedBaseCost(
  state: GameState,
  player: Player,
  baseCost: number,
): void {
  const cost = Math.floor(Number(baseCost));
  if (!Number.isFinite(cost) || cost < 0) return;
  const costs = state.players[player].playedBaseCostsThisMatch;
  if (!costs.includes(cost)) {
    costs.push(cost);
    costs.sort((a, b) => a - b);
  }
}

export function getPlayedBaseCostsThisMatch(
  state: GameState,
  player: Player,
): readonly number[] {
  return state.players[player].playedBaseCostsThisMatch;
}

/** True when every required base cost has been played at least once this match. */
export function hasPlayedBaseCostLadder(
  state: GameState,
  player: Player,
  required: readonly number[],
): boolean {
  if (!required.length) return true;
  const played = new Set(state.players[player].playedBaseCostsThisMatch);
  return required.every((cost) => played.has(cost));
}

export const DEFAULT_FULL_COST_LADDER = [1, 2, 3, 4, 5, 6, 7, 8] as const;
