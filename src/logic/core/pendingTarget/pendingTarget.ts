// src/logic/core/pendingTarget/pendingTarget.ts
// Centralized facade for pendingTargetEffect lifecycle management.
// All ops should use these helpers instead of directly writing to state.pendingTargetEffect.

import { state } from "../../../core/gameState.js";
import { PendingTargetRequest } from "./types.js";

/**
 * Sets the pending target selection state.
 * This is the ONLY approved way for ops to initiate target selection.
 *
 * @param request - The selection request specification
 */
export function setPendingTarget(request: PendingTargetRequest): void {
  state.pendingTargetEffect = request as any;
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















