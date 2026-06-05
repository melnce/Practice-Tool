import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import { dispatchOrderedTriggers } from "./common.js";

export function handleTurnEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  // C1 TODO: drop excludeSources crest interim — fold crests into the turn-boundary
  // queued step order (Grimnir crest → board → opponent path). Until C1, turn-boundary
  // crests still fire via processCrestEvent in turns.ts (ordering not yet unified).
  dispatchOrderedTriggers(event, activePlayer, context, {
    excludeSources: ["crest"],
  });
}
