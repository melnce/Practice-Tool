// src/logic/core/resolutionPause.ts
import { state } from "../../core/gameState.js";
import type { Effect, Player } from "../../core/types/index.js";

export type PendingModeChoice = {
  owner: Player;
  optionCount: number;
  selectCount: number;
  options: Array<{
    label?: string;
    name?: string;
    effects?: Effect[];
    requires?: { earth_rite?: number | string };
  }>;
  sourceCardUid?: string;
  resumeEffects?: Effect[];
  /** Picks accumulated across multi-select rounds (history-safe). */
  partialPickedIndices?: number[];
};

/** True while an interactive target or mode prompt is waiting for player input. */
export function isEffectResolutionPaused(): boolean {
  return !!(state.pendingTargetEffect || state.pendingModeChoice);
}

export function setPendingModeChoice(request: PendingModeChoice): void {
  state.pendingModeChoice = request;
}

export function clearPendingModeChoice(): void {
  delete state.pendingModeChoice;
}

export function isPendingModeChoice(): boolean {
  return !!state.pendingModeChoice;
}
