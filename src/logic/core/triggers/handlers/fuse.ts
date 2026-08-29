import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import { dispatchOrderedTriggers } from "./common.js";

export function handleFuseEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  dispatchOrderedTriggers(event, activePlayer, context, {
    skipCommonConditions: true,
    skipTracking: true,
    predicate: (trigger, cand) => {
      if (cand.owner !== activePlayer) return false;
      if ((trigger.condition as any)?.is_fuse_initiator) {
        const ctxInitiator =
          context.initiator ??
          (context.initiatorUid
            ? ({ uid: context.initiatorUid } as { uid: string })
            : null);
        if (!ctxInitiator || ctxInitiator.uid !== cand.card?.uid) return false;
      }
      return true;
    },
  });
}
