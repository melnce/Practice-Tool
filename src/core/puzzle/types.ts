/**
 * Puzzle mode — a thin checker over a saved position.
 *
 * A puzzle pins: full dual-player state (hands, decks in order, RNG cursor),
 * an optional fixed opponent script, a goal predicate, and a turn limit.
 * It does NOT search for lines, hint, or verify that a solution exists.
 *
 * Bump PUZZLE_SCHEMA_VERSION on incompatible shape changes.
 */

import type { PlayerSlot } from "../types/index.js";
import type { SavedPosition } from "../positionStore.js";
import type { ScriptDocument } from "../script/types.js";

export const PUZZLE_SCHEMA_VERSION = 1 as const;

/**
 * Goal predicates. Evaluation moments:
 * - enemy_leader_hp_0 — after every history commit (lethal is continuous).
 * - clear_enemy_board — at end of the solver's turn (followers only).
 * - survive_n_turns — at end of the solver's turn once turnsUsed >= n.
 */
export type PuzzleGoal =
  | { type: "enemy_leader_hp_0" }
  | { type: "clear_enemy_board" }
  | { type: "survive_n_turns"; n: number };

/** Cheap re-solve target — fewest cards played wins; ties prefer fewer PP spent. */
export type PuzzleBestAttempt = {
  cardsPlayed: number;
  /** Sum of PP paid on Play Card actions during the solving attempt. */
  ppSpent: number;
};

export type PuzzleDefinition = {
  schemaVersion: typeof PUZZLE_SCHEMA_VERSION;
  id: string;
  title: string;
  description?: string;
  /** Side that must achieve the goal. */
  solverSide: PlayerSlot;
  /**
   * Max number of solver turns allowed for lethal / clear goals.
   * For survive_n_turns, must equal goal.n (authoring UI enforces this).
   */
  turnLimit: number;
  goal: PuzzleGoal;
  /** Full starting position (both hands, both deck orders, RNG). */
  position: SavedPosition;
  /**
   * Optional fixed line for the non-solver side. Required for repeatability
   * whenever the opponent would act. Cursor starts at scriptCursor (default 0).
   */
  opponentScript?: ScriptDocument;
  /** Script step index at puzzle start (default 0). */
  scriptCursor?: number;
  /** Best successful attempt recorded in this library entry. */
  bestAttempt?: PuzzleBestAttempt;
  /** Metadata only — never drives gameplay. */
  savedAt: number;
};

export type PuzzleStatus = "idle" | "active" | "solved" | "failed";

export type PuzzleSessionSnapshot = {
  status: PuzzleStatus;
  puzzleId: string | null;
  title: string | null;
  goal: PuzzleGoal | null;
  solverSide: PlayerSlot | null;
  turnLimit: number | null;
  turnsUsed: number;
  cardsPlayed: number;
  ppSpent: number;
  failReason: string | null;
  startHash: string | null;
  bestAttempt: PuzzleBestAttempt | null;
};

export class PuzzleSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PuzzleSchemaError";
  }
}
