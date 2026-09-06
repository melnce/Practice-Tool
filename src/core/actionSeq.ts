import { state } from "./gameState.js";

/** Monotonic per player-action counter — invalidates trigger candidate cache each dispatch. */
export function bumpActionSeq(): void {
  (state as any).actionSeq = ((state as any).actionSeq ?? 0) + 1;
}
