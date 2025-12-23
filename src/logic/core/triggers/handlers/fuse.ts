import { Player } from "../../../../core/types.js";
import { TriggerContext, TriggerEventName } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers } from "../process.js";

export function handleFuseEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  const crests = getCrestCandidates(activePlayer);
  processCandidateTriggers(crests, { event, activePlayer, context });

  const zones = getAllZoneCandidates();
  processCandidateTriggers(zones, {
    event,
    activePlayer,
    context,
    skipCommonConditions: true, // LEGACY: on_fuse relies on implicit logic
    skipTracking: true, // LEGACY: on_fuse doesn't use standard tracking
    predicate: (trigger, cand) => {
      // Legacy: source check implicit (Zones).
      // Logic: if (owner === activePlayer) run.
      return cand.owner === activePlayer;
    },
  });
}
