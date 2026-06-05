import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName, TriggerSpec } from "../types.js";
import type { ProcessingCandidate } from "../process.js";
import { dispatchOrderedTriggers } from "./common.js";

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
  dispatchOrderedTriggers(event, activePlayer, context, {
    skipCommonConditions: true,
    skipTracking: true,
    predicate: (trigger: TriggerSpec, cand: ProcessingCandidate) => {
      if (cand.owner !== activePlayer) return false;

      if (event === "clash") {
        return (
          cand.card.uid === context.attacker?.uid ||
          cand.card.uid === context.defender?.uid
        );
      }

      if (event === "strike" || event === "follower_strike" || event === "leader_strike") {
        return cand.card.uid === context.attacker?.uid;
      }

      return false;
    },
  });
}
