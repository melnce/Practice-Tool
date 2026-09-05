/**
 * Leading "if …" gate in trigger.effects — judged at queue time per rulebook L252.
 * Shared by turn-boundary queue (turnBoundary.ts) and reactive trigger enqueue.
 */
import type { CardInstance, Player } from "../../../core/types/index.js";
import { logEvent } from "../../../core/logger.js";
import { normalizeToGateSpec } from "../../effects/gates/types.js";
import { evaluateCondition } from "../../effects/gates/conditions.js";
import type { TriggerSpec } from "./types.js";

export function preJudgeLeadingGate(
  trigger: TriggerSpec,
  owner: Player,
  card: CardInstance,
  logKind: "turnBoundary" | "reactive" = "turnBoundary",
): TriggerSpec | null {
  const effects = trigger.effects;
  if (!effects?.length || effects[0]?.op !== "gate") return trigger;

  const spec = normalizeToGateSpec(effects[0]);
  const passed = evaluateCondition(spec, owner, card);
  const rest = effects.slice(1);

  if (!passed) {
    const elseBranch = spec.else_effects || [];
    if (elseBranch.length === 0) {
      logEvent(
        logKind === "reactive"
          ? "reactiveGateSkipped"
          : "turnBoundaryGateSkipped",
        {
          card: card.name,
          condition: spec.condition,
          owner,
        },
      );
      return null;
    }
    return { ...trigger, effects: [...elseBranch, ...rest] };
  }

  const ungated = [...(spec.effects || []), ...rest];
  return { ...trigger, effects: ungated };
}
