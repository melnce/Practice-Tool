/**
 * Puzzle attempt bootstrap — position restore + optional opponent script.
 * Lives in logic/ so core/puzzle stays free of script-runtime imports.
 */
import {
  startPuzzle,
  retryPuzzle,
  getActivePuzzle,
  type PuzzleDefinition,
} from "../../core/puzzle/index.js";
import { SCRIPT_SCHEMA_VERSION } from "../../core/script/types.js";
import {
  clearScript,
  loadScriptForPlayback,
  restoreScriptProgress,
} from "../script/runtime.js";

function attachOpponentScript(puzzle: PuzzleDefinition): void {
  if (puzzle.opponentScript) {
    loadScriptForPlayback(puzzle.opponentScript);
    const cursor = puzzle.scriptCursor ?? 0;
    restoreScriptProgress({
      schemaVersion: SCRIPT_SCHEMA_VERSION,
      name: puzzle.opponentScript.name,
      scriptedSide: puzzle.opponentScript.scriptedSide,
      cursor,
    });
  } else {
    clearScript();
  }
}

/** Start a puzzle attempt: identical position hash every time + script pin. */
export function beginPuzzleAttempt(
  id: string,
  opts?: { autoRender?: boolean },
): PuzzleDefinition {
  const puzzle = startPuzzle(id, opts);
  attachOpponentScript(puzzle);
  return puzzle;
}

/** Retry: restore starting position + script cursor identically. */
export function retryPuzzleAttempt(opts?: { autoRender?: boolean }): boolean {
  const before = getActivePuzzle();
  if (!before) return false;
  const ok = retryPuzzle(opts);
  if (!ok) return false;
  const puzzle = getActivePuzzle() ?? before;
  attachOpponentScript(puzzle);
  return true;
}
