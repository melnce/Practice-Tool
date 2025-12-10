// src/helpers/board.ts
/**
 * Checks if the given zone ID represents the board of the current turn's player.
 * @param {string} zoneId - e.g. "blueBoard", "redBoard"
 * @param {object} state - Global game state
 * @returns {boolean}
 */
export function isOwnBoard(zoneId, state) {
    const isBlueBoard = zoneId === "blueBoard";
    const isRedBoard = zoneId === "redBoard";
    if (!isBlueBoard && !isRedBoard)
        return false;
    return (isBlueBoard && state.isBlueTurn) || (isRedBoard && !state.isBlueTurn);
}
/**
 * Checks if the given zone ID is for a board (not hand).
 * @param {string} zoneId
 * @returns {boolean}
 */
export function isBoardZone(zoneId) {
    return zoneId === "blueBoard" || zoneId === "redBoard";
}
/**
 * Checks if the given zone ID is for a hand.
 * @param {string} zoneId
 * @returns {boolean}
 */
export function isHandZone(zoneId) {
    return zoneId === "blueHand" || zoneId === "redHand";
}
/**
 * Returns the owner string ("blue" or "red") for a given zone ID.
 * @param {string} zoneId
 * @returns {string|null}
 */
export function getZoneOwner(zoneId) {
    if (zoneId.startsWith("blue"))
        return "blue";
    if (zoneId.startsWith("red"))
        return "red";
    return null;
}
