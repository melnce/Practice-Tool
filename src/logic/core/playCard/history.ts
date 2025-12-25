import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types/index.js";
import { PlayedHistoryEntry } from "./types.js";
import { getPlayedHistory } from "../../../core/playerHelpers.js";

export function pushPlayedHistory(owner: Player, card: CardInstance) {
  const entry: PlayedHistoryEntry = {
    id: card?.id,
    uid: card?.uid,
    name: card?.name,
    type: card?.type,
    cost: Number(card?.cost) || 0,
    base_image: card?.base_image || null,
    ts: Date.now(),
  };
  getPlayedHistory(state, owner).push(entry);
}














