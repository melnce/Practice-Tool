// src/engine.ts
import { state } from "./core/gameState.js";
import type {
  GameState,
  StartGameOptions,
  PlayerAction,
} from "./core/types/index.js";
import { startGame } from "./logic/startGame.js";
import { endTurnBlue, endTurnRed } from "./logic/core/turns.js";
import {
  undo,
  redo,
  resetHistory,
  initHistoryHotkeys,
  onHistoryChange,
  canUndo,
  canRedo,
  captureSnapshot,
  applySnapshot,
  doAction,
} from "./core/history.js";

export { captureSnapshot, applySnapshot, canUndo, canRedo };

export {
  savePosition,
  listPositions,
  loadPosition,
  renamePosition,
  deletePosition,
  exportPositionToJson,
  importPositionFromJson,
  parsePositionJson,
  setCheckpoint,
  restoreCheckpoint,
  rerollFromCheckpoint,
  applyRerollBranch,
  getCheckpointInfo,
  deriveRerollSeed,
  POSITION_SCHEMA_VERSION,
  setSessionDeckIds,
  initCheckpointHotkeys,
} from "./core/positionStore.js";

export type {
  SavedPosition,
  PositionMeta,
  CheckpointInfo,
} from "./core/positionStore.js";

export {
  savePuzzle,
  listPuzzles,
  getPuzzle,
  deletePuzzle,
  parsePuzzleJson,
  importPuzzleFromJson,
  exportPuzzleToJson,
  startPuzzle,
  retryPuzzle,
  stopPuzzle,
  getPuzzleSessionSnapshot,
  PUZZLE_SCHEMA_VERSION,
} from "./core/puzzle/index.js";

export type {
  PuzzleDefinition,
  PuzzleGoal,
  PuzzleSessionSnapshot,
} from "./core/puzzle/index.js";

export {
  beginPuzzleAttempt,
  retryPuzzleAttempt,
} from "./logic/puzzle/runtime.js";

// Re-exports for consumers (UI/Tests)
export type { GameState } from "./core/types/index.js";
// Do not export mutable state directly. Use getState().

// Action Definitions
export type { PlayerAction };

/**
 * Starts a new game, resetting state and history.
 */
export async function startNewGame(
  options: StartGameOptions,
): Promise<GameState> {
  await startGame(options);
  resetHistory();
  return state;
}

/**
 * Access the current game state (Read-only access recommended).
 */
export function getState(): GameState {
  return state;
}

/**
 * Dispatch a centralized action to mutate state.
 * Currently wraps history commands.
 */
import { playCard } from "./logic/core/playCard/index.js";
import { reportBlockedOutcome } from "./ui/outcomes.js";
import { attackFollower, attackLeader } from "./logic/core/combat.js";
import {
  resolvePendingTarget,
  confirmPendingTargetFromState,
} from "./logic/core/resolveTarget.js";
import { handleEvolveSelf } from "./logic/effects/ops/evolve.js";
import { engageAmulet } from "./logic/effects/ops/engage.js";
import { toggleSecondPlayerBonusPp } from "./core/bonusPp.js";
import {
  toggleMulliganPickCore,
  confirmMulliganCore,
} from "./logic/core/mulliganCore.js";
import { fuseFromHand } from "./logic/core/fuseFromHand.js";
import { setScriptedModePickProvider } from "./logic/script/modeHook.js";
import { applyPendingModePickIndex } from "./logic/effects/ops/mode.js";

/**
 * Dispatch a centralized action to mutate state.
 * Currently wraps history commands and gameplay actions.
 */
import { assertValidGameState } from "./core/stateValidation.js";

function shouldCheckInvariants(): boolean {
  // Enable in tests (HEADLESS) or if explicitly enabled in dev (e.g. by a global flag)
  return !!(globalThis as any).HEADLESS;
}

function _dispatchInternal(
  currentState: GameState,
  action: PlayerAction,
): GameState {
  switch (action.type) {
    case "UNDO":
      undo();
      break;
    case "REDO":
      redo();
      break;
    case "RESET_HISTORY":
      resetHistory();
      break;
    case "END_TURN":
      // Use activePlayer as source of truth (not legacy isFirstPlayerTurn)
      if (currentState.activePlayer === "first") endTurnBlue();
      else endTurnRed();
      break;
    case "PLAY_CARD": {
      const hand =
        action.player === "first"
          ? currentState.players.first.hand
          : currentState.players.second.hand;
      const index = hand.findIndex((c) => c.uid === action.cardUid);
      if (index !== -1) {
        const outcome = playCard(hand, action.player, index);
        reportBlockedOutcome(outcome);
      } else {
        console.warn(
          `[Engine] PlayCard: Card ${action.cardUid} not found in ${action.player} hand.`,
        );
      }
      break;
    }
    case "ATTACK": {
      const attackerBoard =
        action.player === "first"
          ? currentState.players.first.board
          : currentState.players.second.board;
      const attackerIdx = attackerBoard.findIndex(
        (c) => c.uid === action.attackerUid,
      );

      if (attackerIdx === -1) {
        console.warn(
          `[Engine] Attack: Attacker ${action.attackerUid} not found.`,
        );
        break;
      }

      const defender = action.defender;
      if (defender.type === "leader") {
        attackLeader(attackerIdx, action.player, defender.player);
      } else {
        const defPlayer = action.player === "first" ? "second" : "first";
        const defBoard =
          defPlayer === "first"
            ? currentState.players.first.board
            : currentState.players.second.board;
        const defIdx = defBoard.findIndex((c) => c.uid === defender.uid);

        if (defIdx !== -1) {
          attackFollower(attackerIdx, defIdx, action.player, defPlayer);
        } else {
          console.warn(`[Engine] Attack: Defender ${defender.uid} not found.`);
        }
      }
      break;
    }
    case "CHOOSE_TARGET": {
      const target = action.target;
      if (target.type === "leader") {
        resolvePendingTarget("leader");
      } else {
        resolvePendingTarget(target.uid);
      }
      break;
    }
    case "EVOLVE": {
      const board =
        action.player === "first"
          ? currentState.players.first.board
          : currentState.players.second.board;
      const card = board.find((c) => c.uid === action.cardUid);
      if (!card) {
        console.warn(`[Engine] Evolve: ${action.cardUid} not on board.`);
        break;
      }
      const actionName = action.mode === "super" ? "Super Evolve" : "Evolve";
      doAction(
        actionName,
        () => {
          handleEvolveSelf(card, action.player, {
            mode: action.mode,
            spendPoint: true,
            runEvoEffects: true,
          });
        },
        { player: action.player, uid: action.cardUid, mode: action.mode },
        { autoRender: true },
      );
      break;
    }
    case "ENGAGE": {
      const board =
        action.player === "first"
          ? currentState.players.first.board
          : currentState.players.second.board;
      const index = board.findIndex((c) => c.uid === action.cardUid);
      if (index === -1) {
        console.warn(`[Engine] Engage: ${action.cardUid} not on board.`);
        break;
      }
      engageAmulet(action.player, index);
      break;
    }
    case "BONUS_PP": {
      if (action.player !== "second") {
        console.warn("[Engine] BONUS_PP is second-player only");
        break;
      }
      toggleSecondPlayerBonusPp();
      break;
    }
    case "CHOOSE_MODE": {
      const indices = action.indices.slice();
      if (currentState.pendingModeChoice) {
        for (const idx of indices) {
          applyPendingModePickIndex(idx);
        }
        break;
      }
      let consumed = false;
      setScriptedModePickProvider((req) => {
        if (req.owner !== action.player) return null;
        if (consumed) return null;
        consumed = true;
        setScriptedModePickProvider(null);
        return indices;
      });
      break;
    }
    case "TOGGLE_MULLIGAN":
      toggleMulliganPickCore(action.player, action.cardUid);
      break;
    case "CONFIRM_MULLIGAN":
      confirmMulliganCore(action.player);
      break;
    case "CONFIRM_TARGETS":
      if (!confirmPendingTargetFromState()) {
        console.warn("[Engine] CONFIRM_TARGETS: nothing to confirm");
      }
      break;
    case "FUSE": {
      if (action.player !== currentState.activePlayer) {
        console.warn("[Engine] FUSE: not active player's turn");
        break;
      }
      fuseFromHand(action.player, action.cardUid, { autoRender: true });
      break;
    }
    default:
      // Comprehensive check for unknown actions (or union members not handled)
      console.warn("Unknown action dispatched:", action as any);
  }
  return state;
}

/**
 * Dispatch a centralized action to mutate state.
 * Currently wraps history commands and gameplay actions.
 */
export function dispatch(
  currentState: GameState,
  action: PlayerAction,
): GameState {
  // 1. Pre-dispatch invariant check (Dev/Test only)
  if (shouldCheckInvariants()) {
    try {
      assertValidGameState(currentState, `Pre-${action.type}`);
    } catch (e) {
      throw new Error(
        `Invariant failed BEFORE ${action.type}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 2. Execute Action
  const nextState = _dispatchInternal(currentState, action);

  // 3. Post-dispatch invariant check (Dev/Test only)
  if (shouldCheckInvariants()) {
    try {
      assertValidGameState(nextState, `Post-${action.type}`);
    } catch (e) {
      throw new Error(
        `Invariant failed AFTER ${action.type}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return nextState;
}

/**
 * Initialize global hotkeys (Undo/Redo).
 */
export function initHotkeys(target?: Document | HTMLElement) {
  initHistoryHotkeys(target ? { target } : {});
}

/**
 * Subscribe to history changes (for UI buttons).
 */
export function onHistoryUpdate(
  cb: (status: { canUndo: boolean; canRedo: boolean }) => void,
) {
  onHistoryChange(cb);
}
