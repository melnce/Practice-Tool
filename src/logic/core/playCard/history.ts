import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types.js";
import { PlayedHistoryEntry } from "./types.js";

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
  // TODO: Fix typed state in Phase 2 so we don't need 'as any' here
  if (owner === "blue") state.bluePlayedHistory.push(entry);
  else state.redPlayedHistory.push(entry);
}
