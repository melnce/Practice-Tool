import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName, TriggerSpec } from "../types.js";
import type { ProcessingCandidate } from "../process.js";
import { dispatchOrderedTriggers } from "./common.js";

function checkPlayConditions(
  trigger: TriggerSpec,
  context: TriggerContext,
): boolean {
  const cond = trigger.condition || {};
  const played = context.playedCard;
  if (!played) return false;

  if (cond.cost_changed) {
    let changed = !!context.costChanged;
    if (!changed) {
      const printed = Number.isFinite((played as any).base_cost)
        ? Number((played as any).base_cost)
        : parseInt(played.cost as string, 10) || 0;
      const current = parseInt(played.cost as string, 10) || 0;
      const handMod = parseInt((played as any).cost_mod, 10) || 0;
      changed =
        handMod !== 0 ||
        (Number.isFinite((played as any).base_cost) && current !== printed);
    }
    if (!changed) return false;
  }

  if (cond.tribe) {
    const want = String(cond.tribe).toLowerCase();
    const tribes = Array.isArray(played.tribes)
      ? played.tribes!.map((t) => String(t).toLowerCase())
      : [];
    if (!tribes.includes(want)) return false;
  }

  if (cond.name) {
    if (String(played.name) !== String(cond.name)) return false;
  }

  return true;
}

export function handlePlayEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  dispatchOrderedTriggers(event, activePlayer, context, {
    skipCommonConditions: true,
    skipTracking: true,
    predicate: (trigger: TriggerSpec, cand: ProcessingCandidate) => {
      if (cand.owner !== activePlayer) return false;
      if (cand.source !== "board") return false;
      if (!context.playedCard || context.playedCard.type !== "Follower")
        return false;

      return checkPlayConditions(trigger, context);
    },
  });
}
