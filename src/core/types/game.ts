// =============================================================================
// GAME STATE TYPES
// =============================================================================

import type { RNG } from "../rng.js";
import type { PlayerSlot, PlayerState, Player } from "./player.js";
import type { CardInstance } from "./cards.js";
import type { Effect } from "./effects.js";

export interface GameState {
  rng: RNG;

  // === PLAYER DATA (nested) ===
  players: {
    first: PlayerState;
    second: PlayerState;
  };

  // === GLOBAL GAME STATE ===
  roundCount: number;
  /**
   * P0-3 FIX: Explicit turn number for tracking once-per-turn effects.
   * Incremented atomically in turn transitions. Required for determinism.
   */
  turnNumber: number;
  /**
   * P2-3 FIX: Deterministic game tick counter for history timestamps.
   * Incremented on each effect dispatch. Replaces Date.now().
   */
  gameTick: number;
  /** Active player slot - sole source of truth for whose turn it is */
  activePlayer: PlayerSlot;
  gameStarted: boolean;

  // === SECOND PLAYER PP BOOST ===
  secondPlayerPPBoostUsedEarly: boolean;
  secondPlayerPPBoostUsedLate: boolean;
  secondPlayerPPBoostPending: boolean;

  // === MULLIGAN STATE ===
  phase?: "mulligan" | "playing" | "main" | undefined;
  mulliganStage?: "first" | "second" | "done" | undefined;
  mulliganFirstSelected?: Set<string>;
  mulliganSecondSelected?: Set<string>;

  // === EPHEMERAL STATE ===
  pendingTargetEffect?:
    | {
        eff: Effect;
        owner: Player;
        sourceCard: CardInstance | null;
        resumeEffects: Effect[];
        pool: CardInstance[];
        targets: CardInstance[];
        selectCount: number;
        canTargetLeader?: boolean | undefined;
        requiresConfirmation?: boolean | undefined;
        confirmationText?: string | undefined;
        // UID-based fields (preferred for serialization)
        sourceCardUid?: string;
        poolUids?: string[];
        targetUids?: string[];
      }
    | undefined;
  lastSummoned: CardInstance[];
  lastDrawnCards: CardInstance[];
  lastFuse?: { result_name: string; [key: string]: any } | undefined;
  lastDiscardedCosts?: number[];
  lastDiscardedCost?: number;

  // === CLEANUP CONTROL ===
  suppressCleanup?: boolean;

  // === DEBUG ===
  __debugId?: number;

  // Index signature for dynamic properties
  [key: string]: any;
}

export interface StartGameOptions {
  deckAId: string;
  deckBId: string;
  seed?: number | undefined;
}
