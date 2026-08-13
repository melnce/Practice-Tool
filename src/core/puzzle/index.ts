/**
 * Puzzle mode public barrel.
 */
export {
  PUZZLE_SCHEMA_VERSION,
  PuzzleSchemaError,
  type PuzzleGoal,
  type PuzzleDefinition,
  type PuzzleBestAttempt,
  type PuzzleStatus,
  type PuzzleSessionSnapshot,
} from "./types.js";

export {
  isGoalMet,
  isPuzzleLoss,
  enemyFollowerCount,
  enemyLeaderDefeated,
  solverDefeated,
} from "./goals.js";

export {
  savePuzzle,
  listPuzzles,
  getPuzzle,
  deletePuzzle,
  parsePuzzleJson,
  importPuzzleFromJson,
  exportPuzzleToJson,
  exportPuzzleRecordToJson,
  downloadPuzzleJson,
  updatePuzzleBestAttempt,
  onPuzzleLibraryChange,
  _resetPuzzleStoreForTests,
  type CreatePuzzleInput,
} from "./store.js";

export {
  startPuzzle,
  retryPuzzle,
  stopPuzzle,
  getPuzzleSessionSnapshot,
  isPuzzleActive,
  getActivePuzzle,
  notePuzzlePpBeforePlay,
  onPuzzleSessionChange,
  _resetPuzzleSessionForTests,
} from "./session.js";
