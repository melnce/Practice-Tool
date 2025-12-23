import { TriggerSpec, TriggerEventName } from "./types.js";

export function makeOncePerTurnKey(
  trigger: TriggerSpec,
  event: TriggerEventName,
): string {
  return trigger.once_key || `${event || "any"}_once`;
}
