import { Player } from "../../../../core/types/index.js";
import { TriggerContext, TriggerEventName } from "../types.js";
import { getAllZoneCandidates } from "../utils.js";
import { processCandidateTriggers } from "../process.js";

export function handleTurnEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  // Skip crests as they are handled in turns.js
  const zones = getAllZoneCandidates();
  processCandidateTriggers(zones, { event, activePlayer, context });
}















