// =============================================================================
// GAME STATE TYPES
// =============================================================================

import type { RNG } from "../rng.js";
import type { SeedLiteral } from "../seed.js";
import type { PlayerSlot, PlayerState, Player } from "./player.js";
import type { CardInstance } from "./cards.js";
import type { Effect } from "./effects.js";

export interface GameState {
  rng: RNG;

  /**
   * Literal seed the user supplied (or that was generated) for this match.
   * Distinct from `rng.seed`, which is the `>>> 0` uint32 the PRNG uses.
   * Digit-only strings are normalised to numbers at the start boundary so
   * `"12345"` and `12345` are the same game.
   */
  seed: SeedLiteral;

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

  // === MULLIGAN / MATCH PHASE ===
  phase?: "mulligan" | "playing" | "main" | "gameover" | undefined;
  /** Set when phase === "gameover" — why the match ended */
  gameOverReason?: "lethal" | "deckout" | undefined;
  /** Set when phase === "gameover" — winning player slot */
  winner?: PlayerSlot | undefined;
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
        /** Stashed when fanfare pauses mid-play for interactive targeting. */
        resumePlayFollower?: {
          player: Player;
          cardUid: string;
          chosenTierEffects: Effect[] | null;
          costChangedOnPlay: boolean;
          enteringKeywordSnapshot: unknown;
        };
        /** Stashed when Last Words pauses for interactive selection mid-flush. */
        deferredLwComplete?: { cardUid: string; owner: Player };
      }
    | undefined;
  lastSummoned: CardInstance[];
  lastDrawnCards: CardInstance[];
  lastFuse?: { result_name: string; [key: string]: any } | undefined;
  lastDiscardedCosts?: number[];
  lastDiscardedCost?: number;
  lastDiscardedTypes?: string[];
  lastDiscardedType?: string;

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
  /** Accepted as number | string; normalised once inside startGame / reset. */
  seed?: SeedLiteral | undefined;
}
