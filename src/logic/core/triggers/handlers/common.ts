import { Player } from "../../../../core/types/index.js";
import { TriggerContext, TriggerEventName } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers } from "../process.js";

export function handleGenericEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  // 1. Crests (unless implicitly skipped by caller, but here we include them)
  // Legacy fireTrigger skipped crests for start/end_of_turn explicitly.
  // The dispatcher will handle that selection.

  // Crests
  const crests = getCrestCandidates(activePlayer);
  processCandidateTriggers(crests, { event, activePlayer, context });

  // Zones
  const zones = getAllZoneCandidates();
  processCandidateTriggers(zones, { event, activePlayer, context });
}















