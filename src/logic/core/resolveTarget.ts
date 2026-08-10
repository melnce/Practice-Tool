// src/logic/core/resolveTarget.ts
import { state } from "../../core/gameState.js";
import { adapter } from "../../core/adapter.js";
import { runEffects } from "./effects/index.js";
import { clearSelectableFlags } from "./targeting.js";
import { logEvent } from "../../core/logger.js";
import { doAction } from "../../core/history.js";
import type { Player } from "../../core/types/index.js";
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
} from "./cleanup.js";

// Re-export specific legacy accessors if needed by tests, or simple stubs
export { __getRegisteredTargetedOps };

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
  const result = dispatchTargetedOp(opCtx);

  if (result.kind === "handled") {
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

    if (opCtx.resumeEffects?.length) {
      runEffects(opCtx.resumeEffects, opCtx.owner, opCtx.sourceCard);
    }

    if (playFollowerResume) {
      runPlayFollowerPostFanfare(playFollowerResume);
    }
    completeDeferredLwAfterSelection(deferredLwComplete);
    resumeDeferredDeathIfIdle();

    // Render after targeted op completes for immediate visual feedback
    adapter.render();
  }
  // If paused, orchestrator relinquishes control (no cleanup).
}

// UI Bridge
export function confirmTargetsIfNeeded() {
  adapter.triggerConfirmButtonClick();
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
