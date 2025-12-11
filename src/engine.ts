
/**
 * Stable API Entry Point
 * 
 * Helper module for external consumers (tests, UI adapters) to interact with the engine.
 * Only re-exports stable core functions and types.
 */

// Core State
export { state, resetGameState } from "./core/gameState.js";

// Game Flow
export { startGame } from "./logic/startGame.js";
export { endTurnBlue, endTurnRed } from "./logic/core/turns.js";

// Actions
export { playCard } from "./logic/core/playCard.js";

// Effects System
export { runEffects } from "./logic/core/effects.js";

// Types
export * from "./core/types.js";
