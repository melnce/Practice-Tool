/**
 * @file Player Helpers - Single Source of Truth
 *
 * DESIGN: All player data is accessed via `state.players[slot]`.
 * "first"/"second" are the semantic player slots (by turn order).
 *
 * All logic uses PlayerSlot ("first" / "second").
 */

import type {
  GameState,
  Player,
  PlayerSlot,
  CardInstance,
  PlayerState,
} from "./types/index.js";

// ============================================================================
// PLAYER SLOT HELPERS
// ============================================================================

/**
 * Check if a player is the first player (goes first).
 */
export function isFirstPlayer(player: PlayerSlot): boolean {
  return player === "first";
}

/**
 * Get the opposite player slot.
 */
export function opponentOf(player: PlayerSlot): PlayerSlot {
  return player === "first" ? "second" : "first";
}

/**
 * Normalize any player to PlayerSlot format.
 * (Now identity function since Player = PlayerSlot)
 */
export function toSlot(player: Player): PlayerSlot {
  return player;
}

// ============================================================================
// CANONICAL PLAYER ACCESSORS
// ============================================================================

/**
 * Get the PlayerState for a given player slot.
 */
export function getPlayerState(
  state: GameState,
  player: PlayerSlot,
): PlayerState {
  return state.players[player];
}

// ============================================================================
// ZONE ACCESSORS
// ============================================================================

export function getBoard(state: GameState, player: PlayerSlot): CardInstance[] {
  return state.players[player].board;
}

export function getHand(state: GameState, player: PlayerSlot): CardInstance[] {
  return state.players[player].hand;
}

export function getDeck(state: GameState, player: PlayerSlot): CardInstance[] {
  return state.players[player].deck;
}

export function getGraveyard(
  state: GameState,
  player: PlayerSlot,
): CardInstance[] {
  return state.players[player].graveyard;
}

export function getDestroyedHistory(
  state: GameState,
  player: PlayerSlot,
): import("../logic/core/destroyedHistory.js").DestroyedRecord[] {
  return state.players[player].destroyedHistory;
}

export function getPlayedHistory(
  state: GameState,
  player: PlayerSlot,
): import("../logic/core/playCard/types.js").PlayedHistoryEntry[] {
  return state.players[player].playedHistory;
}

export function getShikigamiDeathsThisTurn(
  state: GameState,
  player: PlayerSlot,
): CardInstance[] {
  return state.players[player].shikigamiDeathsThisTurn;
}

// ============================================================================
// RESOURCE ACCESSORS
// ============================================================================

export function getHP(state: GameState, player: PlayerSlot): number {
  return state.players[player].hp;
}

export function setHP(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].hp = value;
}

export function getMaxHP(state: GameState, player: PlayerSlot): number {
  return state.players[player].maxHP;
}

export function setMaxHP(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].maxHP = value;
}

export function getPP(state: GameState, player: PlayerSlot): number {
  return state.players[player].pp;
}

export function setPP(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].pp = value;
}

export function getMaxPP(state: GameState, player: PlayerSlot): number {
  return state.players[player].maxPP;
}

export function setMaxPP(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].maxPP = value;
}

export function getPermPP(state: GameState, player: PlayerSlot): number {
  return state.players[player].permPP;
}

export function setPermPP(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].permPP = value;
}

// ============================================================================
// EVOLUTION ACCESSORS
// ============================================================================

export function getEvoCharges(state: GameState, player: PlayerSlot): number {
  return state.players[player].evoCharges;
}

export function setEvoCharges(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].evoCharges = value;
}

export function getSuperEvoCharges(
  state: GameState,
  player: PlayerSlot,
): number {
  return state.players[player].superEvoCharges;
}

export function setSuperEvoCharges(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].superEvoCharges = value;
}

export function getEvoCount(state: GameState, player: PlayerSlot): number {
  return state.players[player].evoCount;
}

export function setEvoCount(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].evoCount = value;
}

export function incrementEvoCount(state: GameState, player: PlayerSlot): void {
  state.players[player].evoCount++;
}

export function getEvoUsedThisTurn(
  state: GameState,
  player: PlayerSlot,
): boolean {
  return state.players[player].evoUsedThisTurn;
}

export function setEvoUsedThisTurn(
  state: GameState,
  player: PlayerSlot,
  value: boolean,
): void {
  state.players[player].evoUsedThisTurn = value;
}

// ============================================================================
// COUNTER ACCESSORS
// ============================================================================

export function getPlaysThisTurn(state: GameState, player: PlayerSlot): number {
  return state.players[player].playsThisTurn;
}

export function setPlaysThisTurn(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].playsThisTurn = value;
}

export function incrementPlaysThisTurn(
  state: GameState,
  player: PlayerSlot,
): void {
  state.players[player].playsThisTurn++;
}

export function getShadows(state: GameState, player: PlayerSlot): number {
  return state.players[player].shadows;
}

export function setShadows(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].shadows = value;
}

export function addShadows(
  state: GameState,
  player: PlayerSlot,
  amount: number,
): void {
  state.players[player].shadows += amount;
}

export function getModeBonus(state: GameState, player: PlayerSlot): number {
  return state.players[player].modeBonus;
}

export function addModeBonus(
  state: GameState,
  player: PlayerSlot,
  amount: number,
): void {
  state.players[player].modeBonus += amount;
}

export function getRally(state: GameState, player: PlayerSlot): number {
  return state.players[player].rally;
}

export function setRally(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].rally = value;
}

export function incrementRally(state: GameState, player: PlayerSlot): void {
  state.players[player].rally++;
}

// ============================================================================
// CREST ACCESSORS
// ============================================================================

export function getCrests(
  state: GameState,
  player: PlayerSlot,
): import("../logic/effects/crest.js").Crest[] {
  return state.players[player].crests;
}

export function setCrests(
  state: GameState,
  player: PlayerSlot,
  crests: import("../logic/effects/crest.js").Crest[],
): void {
  state.players[player].crests = crests;
}

// ============================================================================
// LEADER STATE ACCESSORS
// ============================================================================

export function getLeaderBarrier(state: GameState, player: PlayerSlot): number {
  return state.players[player].leaderBarrier;
}

export function setLeaderBarrier(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].leaderBarrier = value;
}

export function getLeaderDamageTakenBonus(
  state: GameState,
  player: PlayerSlot,
): number {
  return state.players[player].leaderDamageTakenBonus;
}

export function setLeaderDamageTakenBonus(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].leaderDamageTakenBonus = value;
}

export function getLeaderMaxDamageCap(
  state: GameState,
  player: PlayerSlot,
): number | null {
  return state.players[player].leaderMaxDamageCap;
}

export function setLeaderMaxDamageCap(
  state: GameState,
  player: PlayerSlot,
  value: number | null,
): void {
  state.players[player].leaderMaxDamageCap = value;
}

// ============================================================================
// ATTACK STATE ACCESSORS
// ============================================================================

export function getAnyAllyAttackedThisTurn(
  state: GameState,
  player: PlayerSlot,
): boolean {
  return state.players[player].anyAllyAttackedThisTurn;
}

export function setAnyAllyAttackedThisTurn(
  state: GameState,
  player: PlayerSlot,
  value: boolean,
): void {
  state.players[player].anyAllyAttackedThisTurn = value;
}

// ============================================================================
// ACTIVE PLAYER HELPERS
// ============================================================================

export function getActive(state: GameState): PlayerSlot {
  return state.activePlayer;
}

export function getOpponent(state: GameState): PlayerSlot {
  return opponentOf(state.activePlayer);
}

export function getActiveBoard(state: GameState): CardInstance[] {
  return getBoard(state, state.activePlayer);
}

export function getOpponentBoard(state: GameState): CardInstance[] {
  return getBoard(state, opponentOf(state.activePlayer));
}

export function getActiveHand(state: GameState): CardInstance[] {
  return getHand(state, state.activePlayer);
}

export function getActiveDeck(state: GameState): CardInstance[] {
  return getDeck(state, state.activePlayer);
}

export function getActiveHP(state: GameState): number {
  return getHP(state, state.activePlayer);
}

export function getOpponentHP(state: GameState): number {
  return getHP(state, opponentOf(state.activePlayer));
}

// ============================================================================
// DECKOUT WINS
// ============================================================================

export function getDeckoutWins(state: GameState, player: PlayerSlot): boolean {
  return state.players[player].deckoutWins;
}

export function setDeckoutWins(
  state: GameState,
  player: PlayerSlot,
  value: boolean,
): void {
  state.players[player].deckoutWins = value;
}

export function isPlayerDefeated(
  state: GameState,
  player: PlayerSlot,
): boolean {
  return state.players[player].defeated === true;
}

/** Returns the defeated player slot, or null if the game is ongoing. */
export function getDefeatedPlayer(state: GameState): PlayerSlot | null {
  if (state.players.first.defeated || state.players.first.hp <= 0)
    return "first";
  if (state.players.second.defeated || state.players.second.hp <= 0)
    return "second";
  return null;
}

/** Returns the winning player slot, or null if the game is ongoing. */
export function getWinner(state: GameState): PlayerSlot | null {
  const defeated = getDefeatedPlayer(state);
  if (!defeated) return null;
  return defeated === "first" ? "second" : "first";
}

// ============================================================================
// DECK METADATA
// ============================================================================

export function getDeckFile(
  state: GameState,
  player: PlayerSlot,
): string | undefined {
  return state.players[player].deckFile;
}

export function setDeckFile(
  state: GameState,
  player: PlayerSlot,
  value: string,
): void {
  state.players[player].deckFile = value;
}

// ============================================================================
// BACKROW / BANISH (Not yet in PlayerState - return empty for now)
// ============================================================================

export function getBackrow(
  _state: GameState,
  _player: PlayerSlot,
): CardInstance[] {
  // TODO: Add backrow to PlayerState if needed
  return [];
}

export function getBanish(
  state: GameState,
  player: PlayerSlot,
): CardInstance[] {
  return state.players[player].banish ?? [];
}
