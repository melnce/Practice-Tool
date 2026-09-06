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

/** Regular play-point orbs only (capped at maxPP). */
export function getRegularPP(state: GameState, player: PlayerSlot): number {
  return state.players[player].pp;
}

/** Bonus PP orb (0 or 1) — spent after regular orbs. */
export function getBonusPpOrb(state: GameState, player: PlayerSlot): number {
  return state.players[player].bonusPpOrb;
}

/** Usable PP for the turn (regular + bonus orb). */
export function getPP(state: GameState, player: PlayerSlot): number {
  return getRegularPP(state, player) + getBonusPpOrb(state, player);
}

/** Recovery / refill cap: maxPP plus bonus orb if still present. */
export function getPPRecoverCap(state: GameState, player: PlayerSlot): number {
  return getMaxPP(state, player) + getBonusPpOrb(state, player);
}

export function setRegularPP(
  state: GameState,
  player: PlayerSlot,
  value: number,
): void {
  state.players[player].pp = Math.max(0, value);
}

export function setBonusPpOrb(
  state: GameState,
  player: PlayerSlot,
  value: 0 | 1,
): void {
  state.players[player].bonusPpOrb = value;
}

/**
 * Set total usable PP (test/setup). Splits into regular pool + bonus orb.
 * When total <= maxPP the bonus orb is cleared (consumed or absent).
 */
export function setPP(
  state: GameState,
  player: PlayerSlot,
  total: number,
): void {
  const max = getMaxPP(state, player);
  if (total > max) {
    setRegularPP(state, player, max);
    setBonusPpOrb(state, player, 1);
  } else {
    setRegularPP(state, player, total);
    setBonusPpOrb(state, player, 0);
  }
}

/** Pay PP: regular orbs first, bonus orb last. */
export function spendPP(
  state: GameState,
  player: PlayerSlot,
  amount: number,
): void {
  let remaining = amount;
  const regular = getRegularPP(state, player);
  const fromRegular = Math.min(regular, remaining);
  if (fromRegular > 0) {
    setRegularPP(state, player, regular - fromRegular);
    remaining -= fromRegular;
  }
  if (remaining > 0 && getBonusPpOrb(state, player) > 0) {
    setBonusPpOrb(state, player, 0);
    remaining -= 1;
  }
}

/** Recover PP up to maxPP (+ bonus orb if still present). Returns amount gained. */
export function recoverPP(
  state: GameState,
  player: PlayerSlot,
  amount: number,
): number {
  const cap = getPPRecoverCap(state, player);
  const cur = getPP(state, player);
  const gain = Math.min(amount, Math.max(0, cap - cur));
  if (gain <= 0) return 0;
  const max = getMaxPP(state, player);
  setRegularPP(
    state,
    player,
    Math.min(max, getRegularPP(state, player) + gain),
  );
  return gain;
}

/** Turn-start refill: regular orbs to max, bonus orb cleared. */
export function refillPPAtTurnStart(
  state: GameState,
  player: PlayerSlot,
): void {
  setRegularPP(state, player, getMaxPP(state, player));
  setBonusPpOrb(state, player, 0);
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

/** Number of crests excluding Faith (owner ruling 2026-09-06). Slot cap still uses full list length. */
export function countCrests(state: GameState, player: PlayerSlot): number {
  const crests = getCrests(state, player) || [];
  return crests.filter((c) => !isFaithCrest(c)).length;
}

function isFaithCrest(
  crest: import("../logic/effects/crest.js").Crest,
): boolean {
  if (crest.isFaith) return true;
  // Defensive fallback for older saved states without isFaith.
  return String(crest.name).startsWith("Faith: ");
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

export function getAnyAllyAttackedLeaderThisTurn(
  state: GameState,
  player: PlayerSlot,
): boolean {
  return state.players[player].anyAllyAttackedLeaderThisTurn;
}

export function setAnyAllyAttackedLeaderThisTurn(
  state: GameState,
  player: PlayerSlot,
  value: boolean,
): void {
  state.players[player].anyAllyAttackedLeaderThisTurn = value;
}

export function getAllyAttackedLeaderLastTurn(
  state: GameState,
  player: PlayerSlot,
): boolean {
  return state.players[player].allyAttackedLeaderLastTurn;
}

export function setAllyAttackedLeaderLastTurn(
  state: GameState,
  player: PlayerSlot,
  value: boolean,
): void {
  state.players[player].allyAttackedLeaderLastTurn = value;
}

/** End-of-turn snapshot for "attacked leader on your last turn" gates. */
export function commitAllyAttackedLeaderTurnSnapshot(
  state: GameState,
  player: PlayerSlot,
): void {
  setAllyAttackedLeaderLastTurn(
    state,
    player,
    getAnyAllyAttackedLeaderThisTurn(state, player),
  );
  setAnyAllyAttackedLeaderThisTurn(state, player, false);
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
