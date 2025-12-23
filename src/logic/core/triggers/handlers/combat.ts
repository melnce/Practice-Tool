import { Player } from "../../../../core/types.js";
import { TriggerContext, TriggerEventName, TriggerSpec } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers, ProcessingCandidate } from "../process.js";

export function handleCombatEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  // 1. Crests (Generic processing, no skips)
  const crests = getCrestCandidates(activePlayer);
  processCandidateTriggers(crests, { event, activePlayer, context });

  // 2. Zones (Fast-path / Bypass processing)
  const zones = getAllZoneCandidates();

  processCandidateTriggers(zones, {
    event,
    activePlayer,
    context,
    skipCommonConditions: true, // LEGACY: Clash/Strike logic relies on manual predicates
    skipTracking: true, // LEGACY: Historically these ignore strict tracking
    predicate: (trigger: TriggerSpec, cand: ProcessingCandidate) => {
      if (cand.owner !== activePlayer) return false;

      if (event === "clash") {
        return (
          cand.card.uid === context.attacker?.uid ||
          cand.card.uid === context.defender?.uid
        );
      }
      if (event === "strike" || event === "follower_strike") {
        return cand.card.uid === context.attacker?.uid;
      }
      return false;
    },
  });
}
