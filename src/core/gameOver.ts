/**
 * Terminal match state (lethal / deck-out).
 *
 * Timing (bible §219, §55, §342): leader defense is checked continuously —
 * the first time a leader reaches 0, the match ends immediately. Official
 * rules are silent on whether a remaining effect queue still drains; we
 * apply game-over at the damage/deck-out application site and refuse further
 * top-level actions. Mid-sequence work already in flight may still finish
 * its current atomic step unless callers short-circuit on isGameOver().
 */
import { state } from "./gameState.js";
import type { GameState, PlayerSlot } from "./types/index.js";
import { getDefeatedPlayer, getWinner } from "./playerHelpers.js";
import { logEvent } from "./logger.js";

export type GameOverReason = "lethal" | "deckout";

/** Log dropped pending effect work once the match is terminal. */
export function logEffectsHaltedGameOver(dropped: number): void {
  if (dropped > 0) {
    logEvent("effectsHaltedGameOver", { dropped });
  }
}

/** Clear orchestrator-held effect queues; returns count dropped. */
export function clearOrchestratorEffectQueues(): number {
  let dropped = 0;
  const pending = state.pendingTargetEffect;
  if (pending?.resumeEffects?.length) {
    dropped += pending.resumeEffects.length;
    pending.resumeEffects.length = 0;
  }
  const deferred = (state as any)._deferredDeath as
    | { lw?: unknown[]; leave?: unknown[] }
    | undefined;
  if (deferred) {
    dropped += (deferred.leave?.length ?? 0) + (deferred.lw?.length ?? 0);
    deferred.leave = [];
    deferred.lw = [];
  }
  return dropped;
}

/**
 * When the match is decided, drop pending effect work and log once.
 * @param localQueue - optional in-flight runEffects queue (mutated in place)
 * @returns true if game is over (caller should stop looping)
 */
export function haltEffectsIfGameOver(localQueue?: unknown[]): boolean {
  if (!isGameOver()) return false;
  let dropped = localQueue?.length ?? 0;
  if (localQueue) localQueue.length = 0;
  dropped += clearOrchestratorEffectQueues();
  logEffectsHaltedGameOver(dropped);
  return true;
}

export function isGameOver(s: GameState = state): boolean {
  return s.phase === "gameover";
}

/**
 * If a player is defeated (HP ≤ 0 or defeated flag), enter game-over.
 * Idempotent. Returns true when the match is terminal.
 */
export function applyGameOverIfNeeded(reasonHint?: GameOverReason): boolean {
  if (state.phase === "gameover") return true;

  const loser = getDefeatedPlayer(state);
  if (!loser) return false;

  state.players[loser].defeated = true;
  state.phase = "gameover";

  const winner = getWinner(state) as PlayerSlot;
  let reason: GameOverReason = reasonHint ?? "lethal";
  if (!reasonHint) {
    // Deck-out sets defeated without necessarily dropping HP to 0.
    if (state.players[loser].hp > 0) reason = "deckout";
  }
  (state as any).gameOverReason = reason;
  (state as any).winner = winner;

  logEvent("gameOver", { loser, winner, reason });
  return true;
}
