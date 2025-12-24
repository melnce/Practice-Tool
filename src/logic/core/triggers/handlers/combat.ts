import { Player } from "../../../../core/types.js";
import { TriggerContext, TriggerEventName, TriggerSpec } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers, ProcessingCandidate } from "../process.js";

/**
 * Handle combat-related trigger events.
 * 
 * STRIKE FAMILY (attacker only):
 *   - strike: Fires when player attacks ANYTHING (follower or leader)
 *   - follower_strike: Fires ONLY when attacking a follower
 *   - leader_strike: Fires ONLY when attacking the enemy leader
 * 
 * CLASH (both parties eligible):
 *   - clash: Fires during follower vs follower combat
 *   - Both attacker and defender cards are checked for clash triggers
 *   - Only cards with actual clash triggers will fire
 * 
 * All combat triggers fire BEFORE damage is dealt.
 */
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
    skipCommonConditions: true,
    skipTracking: true,
    predicate: (trigger: TriggerSpec, cand: ProcessingCandidate) => {
      if (cand.owner !== activePlayer) return false;

      // Clash: Both attacker and defender are eligible
      // Only cards with clash triggers actually fire
      if (event === "clash") {
        return (
          cand.card.uid === context.attacker?.uid ||
          cand.card.uid === context.defender?.uid
        );
      }

      // Strike family: Only the attacker is eligible
      if (event === "strike" || event === "follower_strike" || event === "leader_strike") {
        return cand.card.uid === context.attacker?.uid;
      }

      return false;
    },
  });
}















