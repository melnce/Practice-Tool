
// src/engine.ts
import { state } from "./core/gameState.js";
import { GameState, StartGameOptions, PlayerAction } from "./core/types.js";
import { startGame } from "./logic/startGame.js";
import { endTurnBlue, endTurnRed } from "./logic/core/turns.js";
import {
    undo,
    redo,
    resetHistory,
    initHistoryHotkeys,
    onHistoryChange,
    canUndo,
    canRedo
} from "./core/history.js";

// Re-exports for consumers (UI/Tests)
// Re-exports for consumers (UI/Tests)
export type { GameState } from "./core/types.js";
// Do not export mutable state directly. Use getState().

// Action Definitions
export type { PlayerAction };

/**
 * Starts a new game, resetting state and history.
 */
export async function startNewGame(options?: StartGameOptions): Promise<GameState> {
    await startGame();
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
export function dispatch(currentState: GameState, action: PlayerAction): GameState {
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
            if (currentState.isBlueTurn) endTurnBlue();
            else endTurnRed();
            break;
        default:
            console.warn("Unknown action dispatched:", action);
    }
    return state;
}

/**
 * Initialize global hotkeys (Undo/Redo).
 */
export function initHotkeys(target?: Document | HTMLElement) {
    initHistoryHotkeys({ target });
}

/**
 * Subscribe to history changes (for UI buttons).
 */
export function onHistoryUpdate(cb: (status: { canUndo: boolean, canRedo: boolean }) => void) {
    onHistoryChange(cb);
}
