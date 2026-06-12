import type { GameState, PlayerSlot } from "./types/index.js";
import { createPlayerState } from "./playerState.js";
import { createRng } from "./rng.js";
// NOTE: Trigger caches stored on state._triggerCache (auto-reset when state is reset)

// -- 1. Canonical Defaults (Single Source of Truth) --
// Global defaults that are not per-player
const DEFAULTS = {
  roundCount: 1,
  // Mulligan is turn 0; first turn begins at startFirstTurn().
  turnNumber: 0,
  // P2-3 FIX: Deterministic game tick for history timestamps
  gameTick: 0,
  activePlayer: "first" as PlayerSlot, // Sole source of truth for player turn
  gameStarted: false,

  // Second player PP boost (going-second advantage)
  secondPlayerPPBoostUsedEarly: false,
  secondPlayerPPBoostUsedLate: false,
  secondPlayerPPBoostPending: false,

  // Ephemeral
  pendingTargetEffect: undefined,
  lastFuse: undefined,
} as const;

// -- 2. Factory --
// IMPORTANT: seed is REQUIRED for determinism. No Date.now() fallback.
// For tests/dev, use a fixed seed. For production, caller must provide seed.
export function createInitialState(seed: number | string): GameState {
  if (seed === undefined || seed === null) {
    throw new Error("createInitialState requires a seed for determinism");
  }

  const rng = createRng(seed);

  return {
    rng,
    ...DEFAULTS,

    // Players (nested)
    players: {
      first: createPlayerState(false),
      second: createPlayerState(true),
    },

    // Ephemeral arrays
    lastSummoned: [],
    lastDrawnCards: [],

    // Debug Identity
    __debugId: rng.nextFloat(),
  };
}

// -- 3. Exported Singleton --
// Uses fixed seed 0 for singleton. Caller should use resetGameState(seed) before use.
const GLOBAL_KEY = "__GAME_STATE_SINGLETON__";
export const state: GameState =
  (globalThis as any)[GLOBAL_KEY] || createInitialState(0);
(globalThis as any)[GLOBAL_KEY] = state;

// -- 4. Reset Logic --
// IMPORTANT: seed is REQUIRED for determinism. No Date.now() fallback.
export function resetStateInstance(
  target: GameState,
  seed: number | string,
): void {
  if (seed === undefined || seed === null) {
    throw new Error("resetStateInstance requires a seed for determinism");
  }

  // A) Reset players
  target.players.first = createPlayerState(false);
  target.players.second = createPlayerState(true);

  // B) Reset global scalars
  Object.assign(target, DEFAULTS);
  // P0-3/P2-3: Ensure these are explicitly reset (not just spread)
  target.turnNumber = 0;
  target.gameTick = 0;

  // C) Reset ephemeral arrays
  target.lastSummoned = [];
  target.lastDrawnCards = [];

  // D) Reset RNG
  target.rng = createRng(seed);

  // E) Reset meta counters for determinism
  (target as any).actionSeq = 0;
  (target as any).zoneVersion = 0;

  // F) Reset trigger caches (stored on state, so just null them)
  (target as any)._triggerCache = null;

  // G) Death-defer / combat / resume ephemeral (not in DEFAULTS — must clear explicitly)
  (target as any).deferDeathTriggers = false;
  (target as any)._deferredDeath = { lw: [], leave: [] };
  (target as any).suppressCleanup = false;
  (target as any)._runEffectsDepth = 0;
  (target as any).combatResolutionDepth = 0;
  delete (target as any).resumePlayFollower;

  // H) Debug Identity
  target.__debugId = target.rng.nextFloat();

  // Log (lazy import to avoid circular dependency with logger.ts)
  void import("./logger.js").then(({ logEvent }) => {
    logEvent("resetStateInstance", {
      seed: seed,
      debugId: target.__debugId,
    });
  });
}

// IMPORTANT: seed is REQUIRED for determinism. No Date.now() fallback.
export function resetGameState(seed: number | string): void {
  if (seed === undefined || seed === null) {
    throw new Error("resetGameState requires a seed for determinism");
  }
  resetStateInstance(state, seed);
}

// Global debug exposure (matches original)
if (typeof window !== "undefined") {
  (window as any).gameState = state;
  (window as any).debugSummon = () => import("../logic/effects/ops/summon.js");
}








