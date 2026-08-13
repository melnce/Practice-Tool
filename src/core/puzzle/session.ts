/**
 * Active puzzle attempt — checker only.
 *
 * Retry restores the embedded starting position (same seed, RNG cursor, decks)
 * and reloads the opponent script to the same cursor so attempts are identical.
 */
import { state } from "../gameState.js";
import { applySnapshot, onHistoryEvent } from "../history.js";
import { hashGameState } from "../stateHash.js";
import { getPP } from "../playerHelpers.js";
import type { PlayerSlot } from "../types/index.js";
import { logEvent } from "../logger.js";
import { getPuzzle, updatePuzzleBestAttempt } from "./store.js";
import { isGoalMet, isPuzzleLoss } from "./goals.js";
import type {
  PuzzleBestAttempt,
  PuzzleDefinition,
  PuzzleGoal,
  PuzzleSessionSnapshot,
  PuzzleStatus,
} from "./types.js";

type Metrics = { turnsUsed: number; cardsPlayed: number; ppSpent: number };

type Session = {
  puzzle: PuzzleDefinition;
  status: PuzzleStatus;
  metrics: Metrics;
  failReason: string | null;
  startHash: string;
  /** PP snapshot keyed by player — used to attribute spend on Play Card. */
  ppBeforePlay: Partial<Record<PlayerSlot, number>> | null;
};

let session: Session | null = null;
let historyUnsub: (() => void) | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export function onPuzzleSessionChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.error("[Puzzle] listener error", e);
    }
  }
}

const pastMetrics: Metrics[] = [];
const futureMetrics: Metrics[] = [];

function cloneMetrics(m: Metrics): Metrics {
  return {
    turnsUsed: m.turnsUsed,
    cardsPlayed: m.cardsPlayed,
    ppSpent: m.ppSpent,
  };
}

function endingPlayerFromActionName(name: string): PlayerSlot | null {
  if (name === "End Turn (Blue)") return "first";
  if (name === "End Turn (Red)") return "second";
  return null;
}

function ensureHistoryHook(): void {
  if (historyUnsub) return;
  historyUnsub = onHistoryEvent((ev) => {
    if (!session || session.status !== "active") return;

    if (ev.type === "reset") {
      pastMetrics.length = 0;
      futureMetrics.length = 0;
      return;
    }

    if (ev.type === "commit") {
      pastMetrics.push(cloneMetrics(session.metrics));
      futureMetrics.length = 0;
      onCommit(ev.name, ev.meta);
      return;
    }

    if (ev.type === "undo") {
      const removed = pastMetrics.pop();
      if (removed) {
        futureMetrics.push(cloneMetrics(session.metrics));
        session.metrics = removed;
      }
      // Re-check after undo — may leave solved/failed; stay active unless
      // the restored state still satisfies terminal conditions.
      session.status = "active";
      session.failReason = null;
      evaluateAfterMutation({ endOfSolverTurn: false });
      notify();
      return;
    }

    if (ev.type === "redo") {
      const restored = futureMetrics.pop();
      if (restored) {
        pastMetrics.push(cloneMetrics(session.metrics));
        session.metrics = restored;
      }
      evaluateAfterMutation({ endOfSolverTurn: false });
      notify();
    }
  });
}

function onCommit(name: string, meta: unknown): void {
  if (!session || session.status !== "active") return;
  const solver = session.puzzle.solverSide;
  const m = meta as { player?: PlayerSlot; uid?: string } | null;

  if (name === "Play Card" && m?.player === solver) {
    // Count only successful plays (card left the hand). Blocked plays still commit.
    const uid = m.uid;
    const hand = state.players[solver].hand;
    const leftHand = uid ? !hand.some((c) => c.uid === uid) : true;
    if (leftHand) {
      session.metrics.cardsPlayed += 1;
      const before = session.ppBeforePlay?.[solver];
      if (typeof before === "number") {
        const after = getPP(state, solver);
        session.metrics.ppSpent += Math.max(0, before - after);
      }
    }
    session.ppBeforePlay = null;
  }

  const ended = endingPlayerFromActionName(name);
  let endOfSolverTurn = false;
  if (ended === solver) {
    session.metrics.turnsUsed += 1;
    endOfSolverTurn = true;
  }

  evaluateAfterMutation({ endOfSolverTurn });
  notify();
}

/**
 * Mark PP before a play so the commit hook can compute spend.
 * Called from UI / dispatch when a puzzle is active (optional; cardsPlayed
 * still works without it).
 */
export function notePuzzlePpBeforePlay(player: PlayerSlot): void {
  if (!session || session.status !== "active") return;
  if (player !== session.puzzle.solverSide) return;
  session.ppBeforePlay = { [player]: getPP(state, player) };
}

function markSolved(): void {
  if (!session || session.status !== "active") return;
  session.status = "solved";
  session.failReason = null;
  const attempt: PuzzleBestAttempt = {
    cardsPlayed: session.metrics.cardsPlayed,
    ppSpent: session.metrics.ppSpent,
  };
  updatePuzzleBestAttempt(session.puzzle.id, attempt);
  // Refresh local copy of bestAttempt
  const updated = getPuzzle(session.puzzle.id);
  if (updated?.bestAttempt) {
    session.puzzle.bestAttempt = { ...updated.bestAttempt };
  }
  logEvent("puzzle_solved", {
    id: session.puzzle.id,
    title: session.puzzle.title,
    turnsUsed: session.metrics.turnsUsed,
    cardsPlayed: attempt.cardsPlayed,
    ppSpent: attempt.ppSpent,
  });
}

function markFailed(reason: string): void {
  if (!session || session.status !== "active") return;
  session.status = "failed";
  session.failReason = reason;
  logEvent("puzzle_failed", {
    id: session.puzzle.id,
    title: session.puzzle.title,
    reason,
    turnsUsed: session.metrics.turnsUsed,
  });
}

function evaluateAfterMutation(opts: { endOfSolverTurn: boolean }): void {
  if (!session || session.status !== "active") return;
  const { puzzle, metrics } = session;
  const goal = puzzle.goal;

  if (isPuzzleLoss(puzzle.solverSide)) {
    markFailed("Solver defeated");
    return;
  }

  // Lethal goal: continuous (same timing as engine game-over).
  if (goal.type === "enemy_leader_hp_0") {
    if (
      isGoalMet(goal, {
        solverSide: puzzle.solverSide,
        turnsUsed: metrics.turnsUsed,
      })
    ) {
      markSolved();
      return;
    }
  }

  // Board-clear and survive: only at end of solver turn.
  if (opts.endOfSolverTurn) {
    if (goal.type === "clear_enemy_board" || goal.type === "survive_n_turns") {
      if (
        isGoalMet(goal, {
          solverSide: puzzle.solverSide,
          turnsUsed: metrics.turnsUsed,
        })
      ) {
        markSolved();
        return;
      }
    }

    // Turn-limit fail for lethal / clear (survive uses n as the success gate).
    if (
      goal.type !== "survive_n_turns" &&
      metrics.turnsUsed >= puzzle.turnLimit
    ) {
      markFailed(`Turn limit reached (${puzzle.turnLimit})`);
    }
  }
}

/**
 * Restore the embedded starting position and arm the checker.
 * Opponent script playback is the caller's job (UI / logic wrapper) so core
 * stays free of script-runtime imports.
 */
function applyPuzzleStart(
  puzzle: PuzzleDefinition,
  opts?: { autoRender?: boolean },
): void {
  ensureHistoryHook();

  applySnapshot(puzzle.position.state, {
    autoRender: opts?.autoRender ?? true,
    resetHistory: true,
  });

  pastMetrics.length = 0;
  futureMetrics.length = 0;

  session = {
    puzzle: structuredClone(puzzle),
    status: "active",
    metrics: { turnsUsed: 0, cardsPlayed: 0, ppSpent: 0 },
    failReason: null,
    startHash: hashGameState(state),
    ppBeforePlay: null,
  };

  logEvent("puzzle_start", {
    id: puzzle.id,
    title: puzzle.title,
    startHash: session.startHash,
    goal: puzzle.goal.type,
  });

  // Immediate check (already-met goals / already-dead).
  evaluateAfterMutation({ endOfSolverTurn: false });
  notify();
}

/** Begin an attempt from a library puzzle id (position only — wire script outside). */
export function startPuzzle(
  id: string,
  opts?: { autoRender?: boolean },
): PuzzleDefinition {
  const puzzle = getPuzzle(id);
  if (!puzzle) throw new Error(`No puzzle with id "${id}"`);
  applyPuzzleStart(puzzle, opts);
  return puzzle;
}

/** Restore the exact starting position and metrics — same seed, same everything. */
export function retryPuzzle(opts?: { autoRender?: boolean }): boolean {
  if (!session) return false;
  const id = session.puzzle.id;
  const puzzle = getPuzzle(id) ?? session.puzzle;
  applyPuzzleStart(puzzle, opts);
  return true;
}

export function stopPuzzle(): void {
  session = null;
  pastMetrics.length = 0;
  futureMetrics.length = 0;
  notify();
}

export function getPuzzleSessionSnapshot(): PuzzleSessionSnapshot {
  if (!session) {
    return {
      status: "idle",
      puzzleId: null,
      title: null,
      goal: null,
      solverSide: null,
      turnLimit: null,
      turnsUsed: 0,
      cardsPlayed: 0,
      ppSpent: 0,
      failReason: null,
      startHash: null,
      bestAttempt: null,
    };
  }
  return {
    status: session.status,
    puzzleId: session.puzzle.id,
    title: session.puzzle.title,
    goal: session.puzzle.goal as PuzzleGoal,
    solverSide: session.puzzle.solverSide,
    turnLimit: session.puzzle.turnLimit,
    turnsUsed: session.metrics.turnsUsed,
    cardsPlayed: session.metrics.cardsPlayed,
    ppSpent: session.metrics.ppSpent,
    failReason: session.failReason,
    startHash: session.startHash,
    bestAttempt: session.puzzle.bestAttempt
      ? { ...session.puzzle.bestAttempt }
      : null,
  };
}

export function isPuzzleActive(): boolean {
  return session?.status === "active";
}

export function getActivePuzzle(): PuzzleDefinition | null {
  return session?.puzzle ?? null;
}

/** Test helper. */
export function _resetPuzzleSessionForTests(): void {
  session = null;
  pastMetrics.length = 0;
  futureMetrics.length = 0;
  if (historyUnsub) {
    historyUnsub();
    historyUnsub = null;
  }
}
