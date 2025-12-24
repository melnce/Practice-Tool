// src/logic/core/resolveTarget.ts
import { state } from "../../core/gameState.js";
import { adapter } from "../../core/adapter.js";
import { runEffects } from "./effects/index.js";
import { clearSelectableFlags } from "./targeting.js";
import { logEvent } from "../../core/logger.js";
import { doAction } from "../../core/history.js";
import { applyTargetClick, TargetedOpContext } from "./targeting/index.js";
import {
  dispatchTargetedOp,
  __getRegisteredTargetedOps,
} from "../effects/ops/targeted/index.js";

// Re-export specific legacy accessors if needed by tests, or simple stubs
export { __getRegisteredTargetedOps };
// Legacy sentinels are removed as contract is now strict

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

  // Always Render selection updates (engine mutates pending.targets)
  // Render removed - UI layer

  if (result.kind === "continue") {
    return;
  }

  if (result.kind === "confirm_needed") {
    showConfirmationButton(pending);
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
    // Standard cleanup for ALL handled ops (Contract Step 3)
    delete state.pendingTargetEffect;
    clearSelectableFlags();
    adapter.hideTargetConfirmation();

    if (opCtx.resumeEffects?.length) {
      runEffects(opCtx.resumeEffects, opCtx.owner, opCtx.sourceCard);
    }
    // Render removed - UI layer
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
    doAction(
      "Confirm Targets",
      () => {
        const opCtx: TargetedOpContext = {
          eff: pending.eff,
          owner: pending.owner,
          sourceCard: pending.sourceCard,
          targets: pending.targets,
          resumeEffects: pending.resumeEffects,
        };

        logEvent("targetsConfirmed", {
          op: opCtx.eff.op,
          owner: opCtx.owner,
          source: opCtx.sourceCard?.name,
          sourceUid: opCtx.sourceCard?.uid,
          targets: (opCtx.targets || []).map((t: any) => ({
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
    count: Array.isArray(pending.targets) ? pending.targets.length : 0,
  };
  adapter.showTargetConfirmationButton(vm);
}















