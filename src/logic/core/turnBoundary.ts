/**
 * C1 — Two-phase turn boundary queue → resolve (rulebook §188–213).
 * Resolve runs under death-deferral so LW waits until the step batch finishes.
 */
import type { CardInstance, Player } from "../../core/types/index.js";
import { state } from "../../core/gameState.js";
import { opponentOf, getBoard } from "../../core/playerHelpers.js";
import {
  getOrderedTriggerCandidates,
  triggerMatchesCandidateZone,
} from "./triggers/utils.js";
import { evalCommonConditions } from "./triggers/conditions.js";
import { shouldFire, markFired } from "./triggers/tracking.js";
import type { ProcessingCandidate } from "./triggers/process.js";
import type { TriggerContext, TriggerEventName, TriggerSpec } from "./triggers/types.js";
import { runEffects } from "./effects/index.js";
import { flushDeferredDeathBatch, cleanupDead } from "./cleanup.js";
import { clearTemporaryBuffs } from "../effects/self.js";

export type TurnBoundaryEvent = "end_of_turn" | "start_of_turn";

type OwnerRole = "active" | "reactive";

type QueuedTurnTrigger = {
  step: number;
  order: number;
  candidate: ProcessingCandidate;
  trigger: TriggerSpec;
  owner: Player;
};

const EOT_STEPS: { step: number; role: OwnerRole; sources: string[] }[] = [
  { step: 1, role: "active", sources: ["hand", "crest"] },
  { step: 2, role: "active", sources: ["board"] },
  { step: 3, role: "reactive", sources: ["hand", "crest"] },
  { step: 4, role: "reactive", sources: ["board"] },
];

const SOT_STEPS: { step: number; role: OwnerRole; sources: string[] }[] = [
  { step: 2, role: "active", sources: ["hand", "crest"] },
  { step: 3, role: "active", sources: ["board"] },
  { step: 4, role: "reactive", sources: ["hand", "crest"] },
  { step: 5, role: "reactive", sources: ["board"] },
];

function resolveTurnEventName(trigger: TriggerSpec): TriggerEventName | null {
  if (trigger.type === "end_of_turn_own") return "end_of_turn";
  if (trigger.type === "start_of_turn_own") return "start_of_turn";
  const ev = trigger.event as TriggerEventName | undefined;
  return ev ?? null;
}

function ownerRoleForTrigger(
  trigger: TriggerSpec,
  candidate: ProcessingCandidate,
  event: TurnBoundaryEvent,
  focalPlayer: Player,
): OwnerRole | null {
  const opponent = opponentOf(focalPlayer);
  const { owner } = candidate;
  const cond = trigger.condition || {};

  if (cond.whose_turn === "opponent") {
    return owner === opponent ? "reactive" : null;
  }

  if (trigger.type === "end_of_turn_own" || trigger.type === "start_of_turn_own") {
    return owner === focalPlayer ? "active" : null;
  }

  if (cond.own_turn === true) {
    return owner === focalPlayer ? "active" : null;
  }

  // Bare "at the end/start of the turn" — fires on both players' boundaries.
  if (event === "end_of_turn" || event === "start_of_turn") {
    const isBare =
      !cond.whose_turn &&
      cond.own_turn !== true &&
      trigger.type !== "end_of_turn_own" &&
      trigger.type !== "start_of_turn_own";
    if (isBare) {
      return owner === focalPlayer ? "active" : "reactive";
    }
  }

  // Default: owner's turn boundary only.
  return owner === focalPlayer ? "active" : null;
}

function sourceOrder(source: string, sources: string[]): number {
  const idx = sources.indexOf(source);
  return idx >= 0 ? idx : sources.length;
}

function queueTurnBoundaryTriggers(
  event: TurnBoundaryEvent,
  focalPlayer: Player,
  stepDefs: typeof EOT_STEPS,
): QueuedTurnTrigger[] {
  const opponent = opponentOf(focalPlayer);
  const candidates = getOrderedTriggerCandidates(focalPlayer);
  const turnToken = Number.isFinite(state.turnNumber)
    ? state.turnNumber
    : (state.roundCount || 0) * 2 + (state.activePlayer === "first" ? 0 : 1);
  const context: TriggerContext = { _turnNumber: turnToken };
  const queued: QueuedTurnTrigger[] = [];
  let order = 0;

  for (const stepDef of stepDefs) {
    const owner = stepDef.role === "active" ? focalPlayer : opponent;

    for (const cand of candidates) {
      if (cand.owner !== owner) continue;
      if (!stepDef.sources.includes(cand.source)) continue;

      for (const trigger of cand.triggers) {
        if (!triggerMatchesCandidateZone(trigger, cand.source, cand.card)) {
          continue;
        }

        const ev = resolveTurnEventName(trigger);
        if (ev !== event) continue;

        const role = ownerRoleForTrigger(trigger, cand, event, focalPlayer);
        if (role !== stepDef.role) continue;

        if (!evalCommonConditions(trigger, cand.card, cand.owner, focalPlayer, context)) {
          continue;
        }

        if (!shouldFire(trigger, cand.card, event, turnToken, context)) continue;

        queued.push({
          step: stepDef.step,
          order: order++,
          candidate: cand,
          trigger,
          owner: cand.owner,
        });
      }
    }
  }

  queued.sort((a, b) => {
    if (a.step !== b.step) return a.step - b.step;
    const srcA = sourceOrder(a.candidate.source, stepDefs.find((s) => s.step === a.step)?.sources ?? []);
    const srcB = sourceOrder(b.candidate.source, stepDefs.find((s) => s.step === b.step)?.sources ?? []);
    if (srcA !== srcB) return srcA - srcB;
    return a.order - b.order;
  });

  return queued;
}

function resolveTurnBoundaryQueue(
  queue: QueuedTurnTrigger[],
  event: TurnBoundaryEvent,
  focalPlayer: Player,
) {
  if (queue.length === 0) {
    flushDeferredDeathBatch();
    return;
  }

  const turnToken = Number.isFinite(state.turnNumber)
    ? state.turnNumber
    : (state.roundCount || 0) * 2 + (state.activePlayer === "first" ? 0 : 1);
  const context: TriggerContext = { _turnNumber: turnToken };

  try {
    for (const item of queue) {
      const { trigger, candidate } = item;
      const card = candidate.card as CardInstance;
      runEffects(trigger.effects || [], item.owner, card, {
        batchTurnBoundary: true,
        deferDeathTriggers: false,
      });
      markFired(trigger, card, event, turnToken, context);
    }
  } finally {
    flushDeferredDeathBatch();
    (state as any)._deferredDeath = { lw: [], leave: [] };
  }
}

/** End-of-turn: queue steps 1–4, resolve under deferral, then clear temp buffs on both boards. */
export function runEndOfTurnBoundary(endingPlayer: Player) {
  const queue = queueTurnBoundaryTriggers("end_of_turn", endingPlayer, EOT_STEPS);
  resolveTurnBoundaryQueue(queue, "end_of_turn", endingPlayer);

  for (const side of ["first", "second"] as Player[]) {
    getBoard(state, side).forEach((card) => clearTemporaryBuffs(card));
  }
}

/** Start-of-turn: queue steps 2–5, resolve per step; crest/amulet ticks after steps 2/3. */
export function runStartOfTurnBoundary(
  startingPlayer: Player,
  hooks?: {
    tickCrests?: (player: Player) => void;
    tickAmulets?: (player: Player) => void;
  },
) {
  const queue = queueTurnBoundaryTriggers("start_of_turn", startingPlayer, SOT_STEPS);
  const steps = [2, 3, 4, 5];

  for (const step of steps) {
    const batch = queue.filter((q) => q.step === step);
    if (batch.length > 0) {
      resolveTurnBoundaryQueue(batch, "start_of_turn", startingPlayer);
    }
    if (step === 2) hooks?.tickCrests?.(startingPlayer);
    if (step === 3) hooks?.tickAmulets?.(startingPlayer);
  }
}
