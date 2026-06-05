import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import { dispatchOrderedTriggers } from "./common.js";

export function handleDamageEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  dispatchOrderedTriggers(event, activePlayer, context, {
    skipCommonConditions: true,
    skipTracking: true,
    predicate: (trigger, cand) => {
      const damaged = context.damagedCard;
      if (!damaged) return false;
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
  dispatchOrderedTriggers(event, activePlayer, context, {
    skipCommonConditions: true,
    skipTracking: true,
    predicate: (trigger, cand) => {
      const t = context.target;
      if (!t) return false;
      if (cand.card.uid !== t.uid) return false;
      if (cand.source !== "board") return false;
      return true;
    },
  });
}
