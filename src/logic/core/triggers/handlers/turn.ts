import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import { dispatchOrderedTriggers } from "./common.js";

export function handleTurnEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  // Turn-boundary events are handled by turnBoundary.ts (two-phase queue → resolve).
  // Mid-turn fireTrigger calls for start/end_of_turn are unexpected; keep generic path.
  dispatchOrderedTriggers(event, activePlayer, context);
}
