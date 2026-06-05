import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import {
  getOrderedTriggerCandidates,
  type OrderedTriggerOptions,
} from "../utils.js";
import { processCandidateTriggers, type ProcessOptions } from "../process.js";

export type DispatchOrderedOptions = Partial<ProcessOptions> &
  OrderedTriggerOptions;

export function dispatchOrderedTriggers(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
  options?: DispatchOrderedOptions,
) {
  const { excludeSources, ...processOptions } = options ?? {};
  const candidates = getOrderedTriggerCandidates(activePlayer, { excludeSources });
  processCandidateTriggers(candidates, {
    event,
    activePlayer,
    context,
    ...processOptions,
  });
}

export function handleGenericEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  dispatchOrderedTriggers(event, activePlayer, context);
}
