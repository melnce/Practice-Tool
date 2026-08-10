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
} from "./core/history.js";

// Re-exports for consumers (UI/Tests)
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
import { attackFollower, attackLeader } from "./logic/core/combat.js";
import { resolvePendingTarget } from "./logic/core/resolveTarget.js";

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
        playCard(hand, action.player, index);
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
