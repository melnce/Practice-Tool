import { Player } from "../../../../core/types.js";
import { TriggerContext, TriggerEventName, TriggerSpec } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers, ProcessingCandidate } from "../process.js";

function checkPlayConditions(
  trigger: TriggerSpec,
  context: TriggerContext,
): boolean {
  const cond = trigger.condition || {};
  const played = context.playedCard;
  if (!played) return false;

  // cost_changed
  if (cond.cost_changed) {
    // Replicate legacy logic exactly
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

  // tribe
  if (cond.tribe) {
    const want = String(cond.tribe).toLowerCase();
    const tribes = Array.isArray(played.tribes)
      ? played.tribes!.map((t) => String(t).toLowerCase())
      : [];
    if (!tribes.includes(want)) return false;
  }

  // name
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
  // 1. Crests (Generic)
  const crests = getCrestCandidates(activePlayer);
  processCandidateTriggers(crests, { event, activePlayer, context });

  // 2. Zones (Specific legacy logic)
  const zones = getAllZoneCandidates();
  processCandidateTriggers(zones, {
    event,
    activePlayer,
    context,
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
