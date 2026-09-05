// src/logic/core/resolveTarget.ts
import { state } from "../../core/gameState.js";
import { adapter } from "../../core/adapter.js";
import { runEffects } from "./effects/index.js";
import { clearSelectableFlags } from "./targeting.js";
import { logEvent } from "../../core/logger.js";
import { doAction } from "../../core/history.js";
import type {
  Player,
  CardInstance,
  GameState,
} from "../../core/types/index.js";
import type { TargetedOpContext } from "./targeting/index.js";

import { applyTargetClick } from "./targeting/index.js";
import { resolveUids } from "../../core/uidResolver.js";
import {
  dispatchTargetedOp,
  __getRegisteredTargetedOps,
} from "../effects/ops/targeted/index.js";
import {
  consumePlayFollowerResume,
  runPlayFollowerPostFanfare,
  type PlayFollowerResume,
} from "./playCard/followerResume.js";
import {
  completeDeferredLwAfterSelection,
  resumeDeferredDeathIfIdle,
  cleanupDead,
  flushDeferredDeathBatch,
} from "./cleanup.js";
import { clearResolutionQueue } from "./triggers/queue.js";
import { flushDeferredDeckShuffle } from "../effects/ops/returnHandToDeck.js";
import { flushDeferredOnFuse } from "../effects/ops/fuse/types.js";
import { finishFollowerEnter } from "../effects/ops/summon_ops/core.js";

// Re-export specific legacy accessors if needed by tests, or simple stubs
export { __getRegisteredTargetedOps };

/**
 * Targeted-op history steps should not leave an empty prompt shell on after snapshots.
 *
 * Live state is cleared by `orchestrateExecution` once the targeted handler returns;
 * players never see a completed prompt. The shell can still appear on the *after*
 * snapshot for inner `doAction("Resolve Targets")` / `doAction("Confirm Targets")`
 * commits because `commitAction` runs inside the handler before `orchestrateExecution`
 * deletes `pendingTargetEffect` (notably `nested_effects`). Strip it from snapshot
 * copies only — not from live state mid-dispatch.
 */
const PRUNE_EMPTY_PENDING_AFTER_ACTIONS = new Set([
  "Resolve Targets",
  "Confirm Targets",
]);

export function pruneCompletedPendingFromSnapshot(
  snap: GameState,
  actionName: string,
): void {
  if (!PRUNE_EMPTY_PENDING_AFTER_ACTIONS.has(actionName)) return;
  const pending = snap.pendingTargetEffect;
  if (!pending) return;
  if ((pending.targetUids?.length ?? 0) > 0) return;
  if ((pending.targets?.length ?? 0) > 0) return;
  delete snap.pendingTargetEffect;
}

/**
 * Handles a click on a target (card or leader) when a targeting effect is pending.
 * Orchestrates the Flow: Engine (Logic) -> Dispatcher (Effect) -> Cleanup.
 */
export function resolvePendingTarget(uid: string | "leader") {
  const pending = state.pendingTargetEffect;
  if (!pending) return;

  // 1. Delegate Logic to Pure Engine
  const result = applyTargetClick(state, pending, uid);

  // 2. Handle Logic Result
  if (result.kind === "invalid") {
    if (result.reason) console.warn(result.reason);
    return;
  }

  if (result.kind === "continue") {
    adapter.render();
    return;
  }

  if (result.kind === "confirm_needed") {
    showConfirmationButton(pending);
    adapter.render();
    return;
  }

  if (result.kind === "execute") {
    orchestrateExecution(result.opCtx);
  }
}

/**
 * Helper to consolidate execution and cleanup.
 * Used by immediate execution and confirmation callback.
 *
 * CONTRACT: Single Source of Truth for Cleanup.
 * - If Dispatcher returns "handled": Orchestrator MUST cleanup/resume/render.
 * - If Dispatcher returns "paused": Orchestrator MUST NOT cleanup (ownership transferred/delayed).
 * - Handlers are FORBIDDEN from running cleanup (guarded by tripwires).
 * - See docs/targeting-contract.md
 */
function orchestrateExecution(opCtx: TargetedOpContext) {
  (state as any).deferDeathTriggers = true;
  let result: ReturnType<typeof dispatchTargetedOp>;
  try {
    result = dispatchTargetedOp(opCtx);
  } catch (e) {
    (state as any).deferDeathTriggers = false;
    throw e;
  }

  if (result.kind === "handled") {
    flushTargetedOpAfterHandler(opCtx, result);
  } else {
    (state as any).deferDeathTriggers = false;
  }
  // If paused, orchestrator relinquishes control (no cleanup).
}

/** Drain deferred deaths/reactive triggers raised during a targeted-op handler. */
function flushTargetedOpAfterHandler(
  opCtx: TargetedOpContext,
  result: {
    kind: "handled";
    deferredEnter?: { card: CardInstance; owner: Player }[];
  },
) {
  flushDeferredOnFuse();
  const playFollowerResume = (state.pendingTargetEffect?.resumePlayFollower ??
    (state as any).resumePlayFollower) as PlayFollowerResume | undefined;
  const deferredLwComplete = state.pendingTargetEffect?.deferredLwComplete as
    | { cardUid: string; owner: Player }
    | undefined;

  // Standard cleanup for ALL handled ops (Contract Step 3)
  delete state.pendingTargetEffect;
  delete (state as any).resumePlayFollower;
  clearSelectableFlags();
  adapter.hideTargetConfirmation();

  if (result.deferredEnter?.length) {
    for (const { card, owner } of result.deferredEnter) {
      finishFollowerEnter(card, owner);
    }
  }

  // Deaths from the targeted mutation batch while deferDeathTriggers was set.
  cleanupDead();
  (state as any).deferDeathTriggers = false;

  if (opCtx.resumeEffects?.length) {
    runEffects(opCtx.resumeEffects, opCtx.owner, opCtx.sourceCard);
  }
  flushDeferredDeckShuffle(opCtx.owner);

  if (playFollowerResume) {
    runPlayFollowerPostFanfare(playFollowerResume);
  }
  completeDeferredLwAfterSelection(deferredLwComplete);

  // Reactive triggers / deaths raised inside the handler drain after it returns.
  if (!state.pendingTargetEffect && !(state as any)._drainingResolutionQueue) {
    flushDeferredDeathBatch();
    if (!state.pendingTargetEffect) {
      clearResolutionQueue();
    }
  }
  cleanupDead();
  resumeDeferredDeathIfIdle();

  adapter.render();
}

// UI Bridge
export function confirmTargetsIfNeeded() {
  adapter.triggerConfirmButtonClick();
}

/**
 * Force-complete a stuck pending selection (pool emptied mid-pick).
 * Executes with whatever targets are already selected; if none, fizzles
 * (clears pending, resumes deferred death / play-follower resume).
 */
export function forceCompleteOrFizzlePendingTarget(): void {
  const pending = state.pendingTargetEffect;
  if (!pending) return;

  const targetUids = pending.targetUids || [];
  if (targetUids.length > 0) {
    const opCtx: TargetedOpContext = {
      eff: pending.eff,
      owner: pending.owner,
      sourceCard: pending.sourceCard,
      targetUids: [...targetUids],
      resumeEffects: pending.resumeEffects,
    };
    orchestrateExecution(opCtx);
    return;
  }

  // Fizzle: nothing selected and nothing left to pick.
  const playFollowerResume = (pending.resumePlayFollower ??
    (state as any).resumePlayFollower) as PlayFollowerResume | undefined;
  const deferredLwComplete = pending.deferredLwComplete as
    | { cardUid: string; owner: Player }
    | undefined;
  const resumeEffects = pending.resumeEffects;

  delete state.pendingTargetEffect;
  delete (state as any).resumePlayFollower;
  clearSelectableFlags();
  adapter.hideTargetConfirmation();

  if (resumeEffects?.length) {
    runEffects(resumeEffects, pending.owner, pending.sourceCard);
  }
  if (playFollowerResume) {
    runPlayFollowerPostFanfare(playFollowerResume);
  }
  completeDeferredLwAfterSelection(deferredLwComplete);
  resumeDeferredDeathIfIdle();
  cleanupDead();
  adapter.render();
}

// Internal UI helper
function showConfirmationButton(pending: any) {
  const onConfirm = () => {
    const targetUids = pending.targetUids || [];

    // Guard: only enforce minimum selectCount if explicitly flagged (e.g., Ralmia)
    // Most selections (fuse, etc.) use selectCount as a soft max, not a required min
    if (pending.enforceMinSelectCount) {
      const requiredCount =
        typeof pending.selectCount === "number" &&
        Number.isFinite(pending.selectCount) &&
        pending.selectCount > 0
          ? pending.selectCount
          : 1;

      if (targetUids.length < requiredCount) {
        console.warn(
          `[Confirm] Not enough selections: ${targetUids.length}/${requiredCount}`,
        );
        return; // Don't execute, keep selecting
      }
    }

    doAction(
      "Confirm Targets",
      () => {
        // Build UID-only opCtx
        const opCtx: TargetedOpContext = {
          eff: pending.eff,
          owner: pending.owner,
          sourceCard: pending.sourceCard,
          targetUids,
          resumeEffects: pending.resumeEffects,
        };

        // Log with resolved targets for debugging
        const resolvedTargets = resolveUids(targetUids);
        logEvent("targetsConfirmed", {
          op: opCtx.eff.op,
          owner: opCtx.owner,
          source: opCtx.sourceCard?.name,
          sourceUid: opCtx.sourceCard?.uid,
          targetUids,
          targets: resolvedTargets.map((t) => ({
            name: t?.name,
            uid: t?.uid,
            type: t?.type,
          })),
        });

        orchestrateExecution(opCtx);
      },
      {
        op: pending?.eff?.op,
        owner: pending?.owner,
        source: pending?.sourceCard?.name,
      },
      { autoRender: true },
    );
  };

  const vm = {
    pending,
    onConfirm,
    text: pending.confirmationText || "Confirm Selection",
    count: Array.isArray(pending.targetUids) ? pending.targetUids.length : 0,
  };
  adapter.showTargetConfirmationButton(vm);
}
