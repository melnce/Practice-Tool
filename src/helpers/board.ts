// src/helpers/board.ts

import type { GameState, Player } from "../core/types/index.js";

/**
 * Checks if the given zone ID represents the board of the current turn's player.
 * @param {string} zoneId - e.g. "blueBoard", "redBoard"
 * @param {object} state - Global game state
 * @returns {boolean}
 */
export function isOwnBoard(zoneId: string, state: GameState): boolean {
  const isBlueBoard = zoneId === "blueBoard";
  const isRedBoard = zoneId === "redBoard";
  if (!isBlueBoard && !isRedBoard) return false;

  // Use activePlayer as source of truth for turn state
  const isFirstActive = state.activePlayer === "first";
  return (isBlueBoard && isFirstActive) || (isRedBoard && !isFirstActive);
}

/**
 * Checks if the given zone ID is for a board (not hand).
 * @param {string} zoneId
 * @returns {boolean}
 */
export function isBoardZone(zoneId: string): boolean {
  return zoneId === "blueBoard" || zoneId === "redBoard";
}

/**
 * Checks if the given zone ID is for a hand.
 * @param {string} zoneId
 * @returns {boolean}
 */
export function isHandZone(zoneId: string): boolean {
  return zoneId === "blueHand" || zoneId === "redHand";
}

/**
 * Returns the owner PlayerSlot for a given zone ID.
 * @param {string} zoneId
 * @returns {Player|null}
 */
export function getZoneOwner(zoneId: string): Player | null {
  if (zoneId.startsWith("blue")) return "first";
  if (zoneId.startsWith("red")) return "second";
  return null;
}
