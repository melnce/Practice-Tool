import { Player } from "../../../../core/types.js";
import { TriggerContext, TriggerEventName } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers } from "../process.js";

export function handleDamageEvent(
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
    skipCommonConditions: true, // LEGACY: self_damaged has unique condition logic
    skipTracking: true, // LEGACY: self_damaged relies on manual tracking/predicate
    predicate: (trigger, cand) => {
      const damaged = context.damagedCard;
      if (!damaged) return false;
      // Strict identity check (must be THIS follower)
      if (cand.card.uid !== damaged.uid) return false;

      const cond = trigger.condition || {};
      if (
        cond.still_alive &&
        (parseInt(cand.card.defense as string, 10) || 0) <= 0
      )
        return false;
      if (cond.own_turn && cand.owner !== activePlayer) return false;

      return true;
    },
  });
}

export function handleBuffEvent(
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
    skipCommonConditions: true, // LEGACY: self_buffed_up is specialized
    skipTracking: true, // LEGACY: standard tracking skipped
    predicate: (trigger, cand) => {
      const t = context.target;
      if (!t) return false;
      // Legacy: card.uid === t.uid, source === 'board'
      if (cand.card.uid !== t.uid) return false;
      if (cand.source !== "board") return false;
      return true;
    },
  });
}
