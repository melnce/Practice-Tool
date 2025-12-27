import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
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
    // P1-1 RATIONALE: Self-damaged triggers bypass common conditions because:
    // 1. They are SELF-TARGETED: only the damaged card fires its own trigger
    // 2. Predicate below handles identity check via UID
    // 3. Custom conditions (still_alive, own_turn) handled in predicate
    skipCommonConditions: true,
    // P1-1 RATIONALE: Self-damaged triggers bypass tracking because:
    // 1. Each damage event is distinct - implicit once-per-damage semantics
    skipTracking: true,
    predicate: (trigger, cand) => {
      const damaged = context.damagedCard;
      if (!damaged) return false;
      // Strict identity check (must be THIS follower)
      if (cand.card.uid !== damaged.uid) return false;

      const cond = trigger.condition || {};
      if (
        cond.still_alive &&
        (parseInt((cand.card as any).defense as string, 10) || 0) <= 0
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
    // P1-1 RATIONALE: Self-buffed triggers bypass common conditions because:
    // 1. They are SELF-TARGETED: only the buffed card fires its own trigger
    // 2. Predicate handles identity + board source check
    skipCommonConditions: true,
    // P1-1 RATIONALE: Self-buffed triggers bypass tracking because:
    // 1. Each buff event is distinct - card can be buffed multiple times
    skipTracking: true,
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















