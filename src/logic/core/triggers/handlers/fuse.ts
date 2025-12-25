import { Player } from "../../../../core/types/index.js";
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
    // P1-1 RATIONALE: Fuse triggers bypass common conditions because:
    // 1. They are hand-sourced and owner-restricted by predicate
    // 2. Fuse is a unique mechanic not covered by standard conditions
    skipCommonConditions: true,
    // P1-1 RATIONALE: Fuse triggers bypass tracking because:
    // 1. Each fuse action is distinct - implicit once-per-fuse semantics
    skipTracking: true,
    predicate: (trigger, cand) => {
      // Legacy: source check implicit (Zones).
      // Logic: if (owner === activePlayer) run.
      return cand.owner === activePlayer;
    },
  });
}















