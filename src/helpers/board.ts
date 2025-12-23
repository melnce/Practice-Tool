// src/helpers/board.ts

import { GameState } from "../core/types.js";

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

  return (isBlueBoard && state.isBlueTurn) || (isRedBoard && !state.isBlueTurn);
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
 * Returns the owner string ("blue" or "red") for a given zone ID.
 * @param {string} zoneId
 * @returns {string|null}
 */
export function getZoneOwner(zoneId: string): "blue" | "red" | null {
  if (zoneId.startsWith("blue")) return "blue";
  if (zoneId.startsWith("red")) return "red";
  return null;
}
