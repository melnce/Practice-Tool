/**
 * Puzzle goal predicates — checker only, no search.
 */
import { state } from "../gameState.js";
import type { GameState, PlayerSlot } from "../types/index.js";
import { getBoard, opponentOf } from "../playerHelpers.js";
import { isGameOver } from "../gameOver.js";
import type { PuzzleGoal } from "./types.js";

/** Enemy followers currently on board (amulets do not count). */
export function enemyFollowerCount(
  s: GameState,
  solverSide: PlayerSlot,
): number {
  const enemy = opponentOf(solverSide);
  return getBoard(s, enemy).filter((c) => c.type === "Follower").length;
}

export function enemyLeaderDefeated(
  s: GameState,
  solverSide: PlayerSlot,
): boolean {
  const enemy = opponentOf(solverSide);
  // Goal is specifically "leader reaches 0" — deck-out sets defeated without
  // requiring HP 0 and must not count as this predicate.
  return s.players[enemy].hp <= 0;
}

export function solverDefeated(s: GameState, solverSide: PlayerSlot): boolean {
  const p = s.players[solverSide];
  return p.hp <= 0 || !!p.defeated;
}

/**
 * Whether the goal holds right now.
 * For clear_enemy_board / survive_n_turns the session only *asks* this at
 * end-of-solver-turn; for enemy_leader_hp_0 it is asked after every commit.
 */
export function isGoalMet(
  goal: PuzzleGoal,
  opts: {
    solverSide: PlayerSlot;
    turnsUsed: number;
    s?: GameState;
  },
): boolean {
  const s = opts.s ?? state;
  switch (goal.type) {
    case "enemy_leader_hp_0":
      return enemyLeaderDefeated(s, opts.solverSide);
    case "clear_enemy_board":
      return enemyFollowerCount(s, opts.solverSide) === 0;
    case "survive_n_turns":
      return opts.turnsUsed >= goal.n && !solverDefeated(s, opts.solverSide);
    default: {
      const _exhaustive: never = goal;
      void _exhaustive;
      return false;
    }
  }
}

/** Solver lost the match (HP/defeat) — always a puzzle failure. */
export function isPuzzleLoss(
  solverSide: PlayerSlot,
  s: GameState = state,
): boolean {
  if (solverDefeated(s, solverSide)) return true;
  if (isGameOver(s) && s.winner && s.winner !== solverSide) return true;
  return false;
}
