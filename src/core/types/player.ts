// =============================================================================
// PLAYER TYPES
// =============================================================================

import type { PlayedHistoryEntry } from "../../logic/core/playCard/types.js";
import type { Crest } from "../../logic/effects/crest.js";
import type { DestroyedRecord } from "../../logic/core/destroyedHistory.js";
import type { CardInstance } from "./cards.js";

/**
 * Semantic player slot based on turn order.
 * - "first": Player who takes turn 1 (no PP boost, draws 3 cards)
 * - "second": Player who takes turn 2 (has PP boost, draws 3+1 cards)
 */
export type PlayerSlot = "first" | "second";

/**
 * Legacy player identifier - DEPRECATED.
 * Only used for UI display purposes via SLOT_TO_LEGACY.
 * @deprecated Use PlayerSlot for all game logic
 */
export type LegacyPlayer = "blue" | "red";

/**
 * Player type - NOW USES PlayerSlot ONLY
 *
 * All game logic uses "first" / "second" semantic slots.
 * Use SLOT_TO_LEGACY for UI display purposes only.
 */
export type Player = PlayerSlot;

// =============================================================================
// PLAYER STATE (Normalized per-player data)
// =============================================================================

/**
 * Complete state for one player.
 * All per-player data is consolidated here for:
 * - Clean state structure
 * - Easy AI/RL observation
 * - Perspective-agnostic logic
 */
export interface PlayerState {
  // === Resources ===
  hp: number;
  maxHP: number;
  pp: number;
  maxPP: number;
  permPP: number; // Permanent PP bonus (e.g., from Zooey)

  // === Zones ===
  hand: CardInstance[];
  deck: CardInstance[];
  board: CardInstance[];
  graveyard: CardInstance[];
  banish: CardInstance[];

  // === Counters ===
  shadows: number;
  rally: number;
  evoCharges: number;
  superEvoCharges: number;
  modeBonus: number;

  // === Evolution ===
  evoUsedThisTurn: boolean;
  evoCount: number; // Total successful evolves this match

  // === Per-Turn State ===
  playsThisTurn: number;
  anyAllyAttackedThisTurn: boolean;
  /** True if any allied follower attacked the enemy leader this turn. */
  anyAllyAttackedLeaderThisTurn: boolean;
  /**
   * Snapshot at end of owner's previous turn: did any ally attack the enemy
   * leader during that turn? Used by "on your last turn" gate conditions.
   */
  allyAttackedLeaderLastTurn: boolean;
  shikigamiDeathsThisTurn: CardInstance[]; // For Kuon effect

  // === Boost (second player only) ===
  hasBoost: boolean; // True for second player
  boostPending: boolean;
  boostUsedEarly: boolean;
  boostUsedLate: boolean;

  // === History (for RL/analysis) ===
  playedHistory: PlayedHistoryEntry[];
  destroyedHistory: DestroyedRecord[];
  /** Successful follower enters this match (name/tribes/id). See followerEnterHistory.ts. */
  followerEnterHistory: Array<{
    name: string;
    tribes: string[];
    cardId: string;
  }>;
  /** Distinct printed base costs of cards played this match (cost-ladder conditions). */
  playedBaseCostsThisMatch: number[];

  // === Crests ===
  crests: Crest[];

  // === Leader State ===
  leaderBarrier: number;
  leaderDamageTakenBonus: number; // Beelzebub effect
  leaderMaxDamageCap: number | null; // Zooey effect (null = no cap)
  /** When set (e.g. "opponent_turn_end"), clears leaderMaxDamageCap at that boundary. */
  leaderMaxDamageCapExpiry: string | null;

  // === RL Metrics (accumulated during game) ===
  totalDamageDealt: number;
  totalDamageTaken: number;
  totalCardsPlayed: number;
  totalCardsDrawn: number;
  followersDestroyed: number; // Enemy followers this player killed
  deckoutWins: boolean; // If true, this player wins on deckout
  defeated: boolean; // Set when the player loses (e.g. deckout); distinct from HP damage

  // === Deck Metadata ===
  deckFile?: string; // Original deck file path
}
