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
  /** Full initial option pool (stable indices for commit / history). */
  allOptions?: PendingModeChoice["options"];
  /** Maps each entry in `options` (current round pool) to an `allOptions` index. */
  optionOriginalIndices?: number[];
  /** When false, the same option may be picked more than once (default true). */
  unique?: boolean;
  /** Picks accumulated across multi-select rounds (history-safe; indices into allOptions). */
  partialPickedIndices?: number[];
  /** Each CHOOSE_MODE pick is its own committed action (PR #264). */
  picksAreCommitted?: boolean;
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
