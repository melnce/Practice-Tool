import type { CardInstance, Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName, TriggerSpec } from "../types.js";
import { processCandidateTriggers, type ProcessingCandidate } from "../process.js";
import { dispatchOrderedTriggers } from "./common.js";

const ATTACKER_SELF_EVENTS = new Set(["strike", "follower_strike", "clash"]);

/** Attacker Strike/Clash triggers in card-text order (rulebook §228). */
export function fireAttackerCombatTriggers(
  attacker: CardInstance,
  attackerPlayer: Player,
  context: TriggerContext,
) {
  for (const spec of attacker.triggers ?? []) {
    if (!ATTACKER_SELF_EVENTS.has(spec.event)) continue;
    processCandidateTriggers(
      [
        {
          card: attacker,
          owner: attackerPlayer,
          source: spec.source ?? "board",
          triggers: [spec],
        },
      ],
      {
        event: spec.event as TriggerEventName,
        activePlayer: attackerPlayer,
        context,
        skipCommonConditions: true,
        skipTracking: true,
        predicate: (_: TriggerSpec, cand: ProcessingCandidate) =>
          cand.card.uid === attacker.uid,
      },
    );
  }
}

/** Defender Clash triggers in card-text order, after attacker's pre-damage triggers. */
export function fireDefenderClashTriggers(
  defender: CardInstance,
  defenderPlayer: Player,
  context: TriggerContext,
) {
  for (const spec of defender.triggers ?? []) {
    if (spec.event !== "clash") continue;
    processCandidateTriggers(
      [
        {
          card: defender,
          owner: defenderPlayer,
          source: spec.source ?? "board",
          triggers: [spec],
        },
      ],
      {
        event: "clash",
        activePlayer: defenderPlayer,
        context,
        skipCommonConditions: true,
        skipTracking: true,
        predicate: (_: TriggerSpec, cand: ProcessingCandidate) =>
          cand.card.uid === defender.uid,
      },
    );
  }
}

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
