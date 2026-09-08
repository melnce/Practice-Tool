// src/logic/core/resolveTarget.ts
import { state } from "../../core/gameState.js";
import { adapter } from "../../core/adapter.js";
import { runEffects } from "./effects/index.js";
import { clearSelectableFlags } from "./targeting.js";
import { logEvent } from "../../core/logger.js";
import { doAction } from "../../core/history.js";
import type { Player, CardInstance } from "../../core/types/index.js";
import type { TargetedOpContext } from "./targeting/index.js";

import { applyTargetClick } from "./targeting/index.js";
import { highlightSelectable } from "./targeting.js";
import { validateTargetSelection } from "./targeting/validation.js";
import { resolveUids } from "../../core/uidResolver.js";
import { discardHandCardFromTargetPick } from "../effects/hand.js";
import {
  dispatchTargetedOp,
  __getRegisteredTargetedOps,
} from "../effects/ops/targeted/index.js";
import {
  consumePlayFollowerResume,
  runPlayFollowerPostFanfare,
  type PlayFollowerResume,
} from "./playCard/followerResume.js";
import { endPlaySequenceDrainIfIdle } from "./playCard/playSequence.js";
import {
  completeDeferredLwAfterSelection,
  resumeDeferredDeathIfIdle,
  cleanupDead,
  flushDeferredDeathBatch,
} from "./cleanup.js";
import { isEffectResolutionPaused } from "./resolutionPause.js";
import { clearResolutionQueue, getResolutionQueue } from "./triggers/queue.js";
import { flushDeferredDeckShuffle } from "../effects/ops/returnHandToDeck.js";
import { flushDeferredOnFuse } from "../effects/ops/fuse/types.js";
import { finishFollowerEnter } from "../effects/ops/summon_ops/core.js";
import {
  canConfirmPendingTarget,
  getPendingConfirmKey,
  registerPendingConfirmHandler,
  runPendingConfirmHandler,
  type PendingConfirmInput,
} from "./pendingTarget/confirmRegistry.js";
import { recordNoPromptExit } from "./resolveTargetProbe.js";

export type PendingTargetEffect = NonNullable<typeof state.pendingTargetEffect>;

export function formatInvalidTargetStrictChooseFailed(
  uid: string | "leader",
  pending: PendingTargetEffect,
  reason: string,
): string {
  const op =
    pending.eff && typeof pending.eff === "object" && "op" in pending.eff
      ? String((pending.eff as { op?: unknown }).op ?? "(unknown)")
      : "(unknown)";
  const pool = pending.pool ?? [];
  const legalTargets = pool.map((c) => c.uid).join(", ") || "(empty)";
  const canTargetLeader = pending.canTargetLeader === true;
  const leaderNote = canTargetLeader ? " (+ leader)" : "";
  return [
    "invalidTargetStrictChooseFailed:",
    `  uid clicked: ${uid}`,
    `  op: ${op}`,
    `  pool size: ${pool.length}`,
    `  reason: ${reason}`,
    `  legal targets: ${legalTargets}${leaderNote}`,
    "  The test named a target the engine rejected. Use a uid from the legal targets list, or fix the board setup so the target is in the pool.",
  ].join("\n");
}

// Re-export specific legacy accessors if needed by tests, or simple stubs
export { __getRegisteredTargetedOps };

function getRequiredSelectCount(pending: any): number {
  return typeof pending.selectCount === "number" &&
    Number.isFinite(pending.selectCount) &&
    pending.selectCount > 0
    ? pending.selectCount
    : 1;
}

function hasCommittedPicks(pending: { picksAreCommitted?: boolean }): boolean {
  return pending.picksAreCommitted === true;
}

function isMultiPickHandDiscardOp(pending: {
  eff?: { op?: string };
  op?: string;
}): boolean {
  const topOp = String((pending as { op?: string }).op ?? "");
  const effOp = String(pending.eff?.op ?? "");
  return (
    topOp === "discard_select_hand" ||
    effOp === "discard" ||
    effOp === "discard_select_hand"
  );
}

function applyMultiPickDiscardPick(pending: any, uid: string): void {
  if (!pending.targetUids) pending.targetUids = [];
  pending.targetUids.push(uid);
  const pickNumber = pending.targetUids.length;
  discardHandCardFromTargetPick(pending.owner, uid, {
    resetBatch: pickNumber === 1,
    sourceCard: pending.sourceCard ?? null,
  });
}

function completeMultiPickDiscardPending(pending: any): void {
  const opCtx: TargetedOpContext = {
    eff: pending.eff,
    owner: pending.owner,
    sourceCard: pending.sourceCard,
    targetUids: [...(pending.targetUids ?? [])],
    resumeEffects: pending.resumeEffects,
  };

  flushDeferredOnFuse();
  const playFollowerResume = (pending.resumePlayFollower ??
    (state as any).resumePlayFollower) as PlayFollowerResume | undefined;
  const deferredLwComplete = pending.deferredLwComplete as
    | { cardUid: string; owner: Player }
    | undefined;

  delete state.pendingTargetEffect;
  delete (state as any).resumePlayFollower;
  clearSelectableFlags();
  adapter.hideTargetConfirmation();

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

  settleTargetedOpResolutionQueue();
  resumeDeferredDeathIfIdle();
  settleTargetedOpResolutionQueue();

  adapter.render();
}

function resolveCommittedConfirmTarget(pending: any, uid: string | "leader") {
  const previewPending = {
    ...pending,
    targetUids: [...(pending.targetUids ?? [])],
  };
  const preview = applyTargetClick(state, previewPending, uid);
  if (preview.kind === "invalid") {
    if (preview.reason) console.warn(preview.reason);
    return;
  }

  const op = (pending.eff as { op?: string })?.op;
  const actionName =
    preview.kind === "execute" ? "Resolve Targets" : "Pick Target";

  doAction(
    actionName,
    () => {
      const result = applyTargetClick(state, pending, uid);
      if (result.kind === "execute") {
        orchestrateExecution(result.opCtx);
      } else if (result.kind === "confirm_needed") {
        showConfirmationButton(pending);
      } else if (result.kind === "continue") {
        if (pending.pool?.length) {
          highlightSelectable(pending.pool);
        } else {
          clearSelectableFlags();
        }
      }
    },
    {
      op,
      owner: pending.owner,
      source: pending.sourceCard?.name,
      uid,
    },
    { autoRender: true },
  );
}

function resolveMultiPickHandDiscardTarget(
  pending: any,
  uid: string | "leader",
) {
  if (uid === "leader") {
    console.warn("Cannot discard leader via hand discard prompt.");
    return;
  }

  const validation = validateTargetSelection(state, pending, uid);
  if (!validation.ok) {
    if (validation.reason) console.warn(validation.reason);
    return;
  }

  const requiredCount = getRequiredSelectCount(pending);
  const currentUids = pending.targetUids ?? [];
  if (currentUids.includes(uid)) return;

  const pickNumber = currentUids.length + 1;
  const isComplete = pickNumber >= requiredCount;
  const op = (pending.eff as { op?: string })?.op;

  if (!isComplete) {
    doAction(
      "Pick Target",
      () => {
        applyMultiPickDiscardPick(pending, uid);
        if (pending.pool?.length) {
          highlightSelectable(pending.pool);
        } else {
          clearSelectableFlags();
        }
      },
      {
        op,
        owner: pending.owner,
        source: pending.sourceCard?.name,
        pick: pickNumber,
        uid,
      },
      { autoRender: true },
    );
    return;
  }

  doAction(
    "Resolve Targets",
    () => {
      const prevDefer = !!(state as any).deferDeathTriggers;
      (state as any).deferDeathTriggers = true;
      try {
        applyMultiPickDiscardPick(pending, uid);
        completeMultiPickDiscardPending(pending);
      } finally {
        // Restore outer deferral (play sequence, SOT boundary, etc.) — do not hard-clear.
        (state as any).deferDeathTriggers = prevDefer;
      }
    },
    {
      op,
      owner: pending.owner,
      source: pending.sourceCard?.name,
      pick: pickNumber,
      uid,
    },
    { autoRender: true },
  );
}

/**
 * Handles a click on a target (card or leader) when a targeting effect is pending.
 * Orchestrates the Flow: Engine (Logic) -> Dispatcher (Effect) -> Cleanup.
 */
export function resolvePendingTarget(uid: string | "leader") {
  const pending = state.pendingTargetEffect;
  if (!pending) {
    recordNoPromptExit(uid);
    return;
  }

  if (hasCommittedPicks(pending)) {
    if (isMultiPickHandDiscardOp(pending)) {
      resolveMultiPickHandDiscardTarget(pending, uid);
    } else {
      resolveCommittedConfirmTarget(pending, uid);
    }
    return;
  }

  // 1. Delegate Logic to Pure Engine
  const result = applyTargetClick(state, pending, uid);

  // 2. Handle Logic Result
  if (result.kind === "invalid") {
    throw new Error(
      formatInvalidTargetStrictChooseFailed(uid, pending, result.reason),
    );
  }

  if (result.kind === "continue") {
    if (pending.pool?.length) {
      highlightSelectable(pending.pool);
    }
    adapter.render();
    return;
  }

  if (result.kind === "confirm_needed") {
    showConfirmationButton(pending);
    adapter.render();
    return;
  }

  if (result.kind === "execute") {
    const op = (pending.eff as { op?: string } | undefined)?.op;
    doAction(
      "Resolve Targets",
      () => orchestrateExecution(result.opCtx),
      {
        op,
        owner: pending.owner,
        source: pending.sourceCard?.name,
      },
      { autoRender: true },
    );
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

/** Drain reactive/death queue raised during a targeted-op handler before history commit. */
function settleTargetedOpResolutionQueue(): void {
  for (let round = 0; round < 32; round++) {
    if (isEffectResolutionPaused()) return;
    if ((state as any)._drainingResolutionQueue) return;

    cleanupDead();
    if (getResolutionQueue().length === 0) return;

    const lenBefore = getResolutionQueue().length;
    flushDeferredDeathBatch();
    if (isEffectResolutionPaused()) return;
    if (getResolutionQueue().length === 0) {
      clearResolutionQueue();
      return;
    }
    if (getResolutionQueue().length >= lenBefore) return;
  }
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

  settleTargetedOpResolutionQueue();
  endPlaySequenceDrainIfIdle();
  resumeDeferredDeathIfIdle();
  settleTargetedOpResolutionQueue();

  adapter.render();
}

// UI Bridge
export function confirmTargetsIfNeeded() {
  adapter.triggerConfirmButtonClick();
}

function confirmPendingTargetImpl(): void {
  const pending = state.pendingTargetEffect as PendingConfirmInput | undefined;
  if (!pending || !canConfirmPendingTarget(pending)) return;

  const fullPending = state.pendingTargetEffect!;
  const targetUids = fullPending.targetUids || [];
  const opCtx: TargetedOpContext = {
    eff: fullPending.eff,
    owner: fullPending.owner,
    sourceCard: fullPending.sourceCard,
    targetUids: [...targetUids],
    resumeEffects: fullPending.resumeEffects,
  };

  doAction(
    "Confirm Targets",
    () => {
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
      op: fullPending?.eff?.op,
      owner: fullPending?.owner,
      source: fullPending?.sourceCard?.name,
      confirmKey: getPendingConfirmKey(pending),
    },
    { autoRender: true },
  );
}

const FUSE_FINALIZE_CONFIRM_TYPES = [
  "cards",
  "gear_multi",
  "fortifier",
  "alpha",
  "loot",
  "generic",
  "gardens_allure",
] as const;

for (const fuseType of FUSE_FINALIZE_CONFIRM_TYPES) {
  registerPendingConfirmHandler(
    `fuse:finalize:${fuseType}`,
    confirmPendingTargetImpl,
  );
}
registerPendingConfirmHandler("targeted:default", confirmPendingTargetImpl);

/** Confirm pending selection from serializable prompt data (undo/save/load/re-execute). */
export function confirmPendingTargetFromState(): boolean {
  const pending = state.pendingTargetEffect as PendingConfirmInput | undefined;
  if (!canConfirmPendingTarget(pending)) return false;
  const key = getPendingConfirmKey(pending!)!;
  return runPendingConfirmHandler(key);
}

export { canConfirmPendingTarget, getPendingConfirmKey };

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
    const op = (pending.eff as { op?: string } | undefined)?.op;
    doAction(
      "Resolve Targets",
      () => orchestrateExecution(opCtx),
      {
        op,
        owner: pending.owner,
        source: pending.sourceCard?.name,
      },
      { autoRender: true },
    );
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

// Internal UI helper — reconstructs adapter callback from serializable pending data.
export function resyncPendingTargetConfirmation(): void {
  const pending = state.pendingTargetEffect as PendingConfirmInput | undefined;
  if (!canConfirmPendingTarget(pending)) return;
  showConfirmationButton(state.pendingTargetEffect);
}

function showConfirmationButton(pending: any) {
  const vm = {
    pending,
    onConfirm: () => confirmPendingTargetFromState(),
    text: pending.confirmationText || "Confirm Selection",
    count: Array.isArray(pending.targetUids) ? pending.targetUids.length : 0,
  };
  adapter.showTargetConfirmationButton(vm);
}
