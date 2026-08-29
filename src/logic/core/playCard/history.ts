import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { PlayedHistoryEntry } from "./types.js";
import { getPlayedHistory } from "../../../core/playerHelpers.js";
import { recordPlayedBaseCost } from "../playedBaseCostHistory.js";

export function pushPlayedHistory(owner: Player, card: CardInstance) {
  // P0-1 FIX: Use state.gameTick for deterministic timestamps (was Date.now())
  const gameTick = (state as any).gameTick ?? 0;
  const baseCost =
    card.base_cost !== undefined
      ? Number(card.base_cost)
      : parseInt(String(card.cost), 10) || 0;
  const entry: PlayedHistoryEntry = {
    id: card?.id,
    uid: card?.uid,
    name: card?.name,
    type: card?.type,
    cost: Number(card?.cost) || 0,
    base_cost: baseCost,
    base_image: card?.base_image || null,
    ts: gameTick,
  };
  getPlayedHistory(state, owner).push(entry);
  recordPlayedBaseCost(state, owner, baseCost);
}
