import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import { dispatchOrderedTriggers } from "./common.js";
import { state } from "../../../../core/gameState.js";
import { getBoard } from "../../../../core/playerHelpers.js";

export function handleDamageEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  dispatchOrderedTriggers(event, activePlayer, context, {
    skipCommonConditions: true,
    predicate: (trigger, cand) => {
      const damaged = context.damagedCard;
      if (!damaged) return false;

      // Crest triggers watch any allied follower on the crest owner's board.
      if (cand.source === "crest") {
        const ownerBoard = getBoard(state, cand.owner) || [];
        if (!ownerBoard.includes(damaged)) return false;
      } else if (cand.card.uid !== damaged.uid) {
        return false;
      }

      const cond = trigger.condition || {};
      const lifeEntity = cand.source === "crest" ? damaged : cand.card;
      if (
        cond.still_alive &&
        (parseInt(String(lifeEntity.defense), 10) || 0) <= 0
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
