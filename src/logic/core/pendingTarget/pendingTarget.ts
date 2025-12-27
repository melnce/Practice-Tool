// src/logic/core/pendingTarget/pendingTarget.ts
// Centralized facade for pendingTargetEffect lifecycle management.
// All ops should use these helpers instead of directly writing to state.pendingTargetEffect.

import { state } from "../../../core/gameState.js";
import type { PendingTargetRequest } from "./types.js";
import { toUids, toUid } from "../../../core/uidResolver.js";

/**
 * Sets the pending target selection state.
 * This is the ONLY approved way for ops to initiate target selection.
 * 
 * Auto-populates UID fields from object refs if not provided.
 *
 * @param request - The selection request specification
 */
export function setPendingTarget(request: Partial<PendingTargetRequest> & { eff: any; owner: any; selectCount: number }): void {
  // Auto-populate UID fields from object refs if not provided
  const normalized: any = { ...request };

  // Ensure targetUids exists (default empty)
  if (!normalized.targetUids) {
    normalized.targetUids = normalized.targets ? toUids(normalized.targets) : [];
  }

  // Ensure poolUids exists
  if (!normalized.poolUids) {
    normalized.poolUids = normalized.pool ? toUids(normalized.pool) : [];
  }

  // Populate sourceCardUid if sourceCard is provided
  if (normalized.sourceCard && !normalized.sourceCardUid) {
    normalized.sourceCardUid = toUid(normalized.sourceCard);
  }

  state.pendingTargetEffect = normalized;
}

/**
 * Clears the pending target selection state.
 * Called by resolveTarget after execution completes.
 */
export function clearPendingTarget(): void {
  delete state.pendingTargetEffect;
}

/**
 * Gets the current pending target selection state.
 * Safe for UI/read-only access.
 */
export function getPendingTarget(): PendingTargetRequest | null {
  return (state.pendingTargetEffect as PendingTargetRequest) || null;
}

/**
 * Checks if there is a pending target selection.
 * Use for pause/resume checks in playCard/* modules.
 */
export function isPendingTarget(): boolean {
  return !!state.pendingTargetEffect;
}















