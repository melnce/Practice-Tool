/**
 * @file Test Harness - State Builders
 *
 * DESIGN: Fluent API for constructing minimal, deterministic game states.
 * Enables mechanic-focused testing without full game simulation.
 *
 * USAGE:
 *   givenGameState({ seed: 42 })
 *     .withFirstBoard([{ name: "Goblin", attack: 1, defense: 2 }])
 *     .withSecondHP(15)
 *     .build();
 *
 * INVARIANTS:
 *   - All state changes are deterministic (seeded RNG required)
 *   - Builders never mutate shared state until build() is called
 *   - Created cards have unique UIDs (auto-generated if not provided)
 */

import { state, resetGameState } from "../../src/core/gameState.js";
import type {
  GameState,
  CardInstance,
  PlayerSlot,
  Effect,
} from "../../src/core/types/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  playCardNoRender,
  PlayOutcome,
} from "../../src/logic/core/playCard/index.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
} from "../../src/core/playerHelpers.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Minimal card specification for test setup.
 * Can be a card ID (string), a partial CardInstance, or full CardInstance.
 */
export type CardSpec =
  | string // Card ID - will be looked up from registry
  | (Partial<CardInstance> & { name: string }); // Inline spec with required name

/** Deterministic filler cards so turn draws don't accidental-deckout in mechanic tests. */
function makeFillerDeck(prefix: string, n: number): CardSpec[] {
  const out: CardSpec[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      name: `${prefix}${i}`,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
    });
  }
  return out;
}

/**
 * Configuration for game state builder.
 */
export interface GameStateConfig {
  seed: number;
  activePlayer?: PlayerSlot;
  turn?: number;
  roundCount?: number;
}

/**
 * Player-specific configuration.
 */
export interface PlayerConfig {
  board?: CardSpec[];
  hand?: CardSpec[];
  deck?: CardSpec[];
  hp?: number;
  maxHP?: number;
  pp?: number;
  maxPP?: number;
  evoCharges?: number;
  shadows?: number;
}

// =============================================================================
// UID GENERATION
// =============================================================================

let uidCounter = 0;

/**
 * Reset UID counter. Call in beforeEach for deterministic UIDs.
 */
export function resetUidCounter(): void {
  uidCounter = 0;
}

/**
 * Generate a unique test UID.
 */
function generateUid(prefix: string = "test"): string {
  return `${prefix}_${++uidCounter}`;
}

// =============================================================================
// CARD CREATION
// =============================================================================

/**
 * Create a CardInstance from a CardSpec.
 *
 * @param spec - Card ID string or partial card definition
 * @param zone - Zone the card will be placed in
 * @param owner - Player who owns the card
 * @returns Fully formed CardInstance
 */
export function createCard(
  spec: CardSpec,
  zone: CardInstance["zone"] = "board",
  owner: PlayerSlot = "first",
): CardInstance {
  let base: Partial<CardInstance>;

  if (typeof spec === "string") {
    // Lookup card by ID
    const template = getCardById(spec);
    if (!template) {
      throw new Error(`[TestHarness] Card not found in registry: ${spec}`);
    }
    base = { ...template } as Partial<CardInstance>;
  } else {
    // Use inline spec
    base = { ...spec };
  }

  // Build card with defaults, then spread base, then override zone/owner
  const uid = base.uid ?? generateUid(base.name ?? "card");
  const card: CardInstance = {
    // Spread base first (may contain zone/owner from spec)
    ...base,

    // Then apply required fields with defaults
    uid,
    id: base.id ?? uid,
    name: base.name ?? "Unknown Card",
    type: base.type ?? "Follower",
    cost: base.cost ?? 1,
    attack: base.attack ?? 1,
    defense: base.defense ?? 1,

    // Combat state defaults for followers
    can_attack: base.can_attack ?? false,
    hasAttacked: base.hasAttacked ?? false,
    justPlayed: base.justPlayed ?? true,

    // Force zone and owner to the specified values (always override)
    zone,
    owner,
  } as CardInstance;

  return card;
}

/**
 * Create multiple cards from specs.
 */
export function createCards(
  specs: CardSpec[],
  zone: CardInstance["zone"],
  owner: PlayerSlot,
): CardInstance[] {
  return specs.map((spec) => createCard(spec, zone, owner));
}

// =============================================================================
// STATE BUILDER (FLUENT API)
// =============================================================================

/**
 * Fluent builder for game state setup.
 * Does not mutate global state until build() is called.
 */
export class GameStateBuilder {
  private config: GameStateConfig;
  private firstPlayer: PlayerConfig = {};
  private secondPlayer: PlayerConfig = {};

  constructor(config: GameStateConfig) {
    this.config = {
      activePlayer: "first",
      turn: 1,
      roundCount: 1,
      ...config,
    };
  }

  // --- First Player Setters ---

  withFirstBoard(cards: CardSpec[]): this {
    this.firstPlayer.board = cards;
    return this;
  }

  withFirstHand(cards: CardSpec[]): this {
    this.firstPlayer.hand = cards;
    return this;
  }

  withFirstDeck(cards: CardSpec[]): this {
    this.firstPlayer.deck = cards;
    return this;
  }

  withFirstHP(hp: number): this {
    this.firstPlayer.hp = hp;
    return this;
  }

  withFirstPP(pp: number, maxPP?: number): this {
    this.firstPlayer.pp = pp;
    if (maxPP !== undefined) this.firstPlayer.maxPP = maxPP;
    return this;
  }

  withFirstEvo(charges: number): this {
    this.firstPlayer.evoCharges = charges;
    return this;
  }

  withFirstShadows(shadows: number): this {
    this.firstPlayer.shadows = shadows;
    return this;
  }

  // --- Second Player Setters ---

  withSecondBoard(cards: CardSpec[]): this {
    this.secondPlayer.board = cards;
    return this;
  }

  withSecondHand(cards: CardSpec[]): this {
    this.secondPlayer.hand = cards;
    return this;
  }

  withSecondDeck(cards: CardSpec[]): this {
    this.secondPlayer.deck = cards;
    return this;
  }

  withSecondHP(hp: number): this {
    this.secondPlayer.hp = hp;
    return this;
  }

  withSecondPP(pp: number, maxPP?: number): this {
    this.secondPlayer.pp = pp;
    if (maxPP !== undefined) this.secondPlayer.maxPP = maxPP;
    return this;
  }

  withSecondEvo(charges: number): this {
    this.secondPlayer.evoCharges = charges;
    return this;
  }

  withSecondShadows(shadows: number): this {
    this.secondPlayer.shadows = shadows;
    return this;
  }

  // --- Generic Player Setters (for dynamic player reference) ---

  withBoard(player: PlayerSlot, cards: CardSpec[]): this {
    if (player === "first") {
      this.firstPlayer.board = cards;
    } else {
      this.secondPlayer.board = cards;
    }
    return this;
  }

  withHand(player: PlayerSlot, cards: CardSpec[]): this {
    if (player === "first") {
      this.firstPlayer.hand = cards;
    } else {
      this.secondPlayer.hand = cards;
    }
    return this;
  }

  // --- Configuration Setters ---

  withActivePlayer(player: PlayerSlot): this {
    this.config.activePlayer = player;
    return this;
  }

  withTurn(turn: number): this {
    this.config.turn = turn;
    return this;
  }

  withRound(round: number): this {
    this.config.roundCount = round;
    return this;
  }

  // --- Build ---

  /**
   * Apply configuration to global state.
   * Mutates the global singleton and returns reference.
   */
  build(): GameState {
    // Reset to clean slate with deterministic seed
    resetGameState(this.config.seed);

    // Apply global config
    state.activePlayer = this.config.activePlayer!;
    state.turnNumber = this.config.turn!;
    state.roundCount = this.config.roundCount!;

    // Default filler decks so turn draws do not accidental-deckout.
    // Explicit `.withFirstDeck([])` / `.withSecondDeck([])` keeps empty for deck-out tests.
    if (this.firstPlayer.deck === undefined) {
      this.firstPlayer.deck = makeFillerDeck("PadF", 30);
    }
    if (this.secondPlayer.deck === undefined) {
      this.secondPlayer.deck = makeFillerDeck("PadS", 30);
    }

    // Apply first player config
    this.applyPlayerConfig("first", this.firstPlayer);

    // Apply second player config
    this.applyPlayerConfig("second", this.secondPlayer);

    return state;
  }

  private applyPlayerConfig(player: PlayerSlot, config: PlayerConfig): void {
    const ps = state.players[player];

    // Resources
    if (config.hp !== undefined) ps.hp = config.hp;
    if (config.maxHP !== undefined) ps.maxHP = config.maxHP;
    if (config.pp !== undefined) ps.pp = config.pp;
    if (config.maxPP !== undefined) ps.maxPP = config.maxPP;
    if (config.evoCharges !== undefined) ps.evoCharges = config.evoCharges;
    if (config.shadows !== undefined) ps.shadows = config.shadows;

    // Zones
    if (config.board) {
      ps.board = createCards(config.board, "board", player);
    }
    if (config.hand) {
      ps.hand = createCards(config.hand, "hand", player);
    }
    if (config.deck) {
      ps.deck = createCards(config.deck, "deck", player);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new game state builder.
 *
 * @example
 * givenGameState({ seed: 42 })
 *   .withFirstBoard([{ name: "Knight", attack: 2, defense: 2 }])
 *   .withSecondHP(15)
 *   .build();
 */
export function givenGameState(config: GameStateConfig): GameStateBuilder {
  resetUidCounter();
  return new GameStateBuilder(config);
}

/**
 * Quick setup for common testing scenarios.
 * Resets state and applies minimal defaults.
 */
export function givenEmptyState(seed: number = 1): GameState {
  return givenGameState({ seed }).build();
}

// =============================================================================
// ACTION HELPERS
// =============================================================================

/**
 * Play a card from the player's hand.
 *
 * @param player - Which player is playing
 * @param handIndex - Index of card in hand (0-based)
 * @returns PlayOutcome
 */
export function whenPlayCard(
  player: PlayerSlot,
  handIndex: number,
): PlayOutcome {
  const hand = getHand(state, player);
  return playCardNoRender(hand, player, handIndex);
}

/**
 * Execute effects directly on the state.
 * Useful for testing individual operations in isolation.
 *
 * @param effects - Effects to execute
 * @param owner - Who triggers the effects
 * @param sourceCard - Optional source card
 */
export function whenRunEffects(
  effects: Effect[],
  owner: PlayerSlot,
  sourceCard?: CardInstance | null,
): void {
  runEffects(effects, owner, sourceCard ?? null);
}

/**
 * End the current player's turn.
 */
export function whenEndTurn(): void {
  if (state.activePlayer === "first") {
    endTurnBlue();
  } else {
    endTurnRed();
  }
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Get a snapshot of the player's board.
 */
export function thenBoard(player: PlayerSlot): CardInstance[] {
  return getBoard(state, player);
}

/**
 * Get a snapshot of the player's hand.
 */
export function thenHand(player: PlayerSlot): CardInstance[] {
  return getHand(state, player);
}

/**
 * Get a snapshot of the player's deck.
 */
export function thenDeck(player: PlayerSlot): CardInstance[] {
  return state.players[player].deck;
}

/**
 * Get the player's current HP.
 */
export function thenHP(player: PlayerSlot): number {
  return getHP(state, player);
}

/**
 * Get the player's current PP.
 */
export function thenPP(player: PlayerSlot): number {
  return getPP(state, player);
}

/**
 * Find a card on the board by name.
 * Returns first match or undefined.
 */
export function findOnBoard(
  player: PlayerSlot,
  name: string,
): CardInstance | undefined {
  return thenBoard(player).find((c) => c.name === name);
}

/**
 * Find a card on the board by UID.
 */
export function findByUid(
  player: PlayerSlot,
  uid: string,
): CardInstance | undefined {
  return thenBoard(player).find((c) => c.uid === uid);
}

/**
 * Count cards on board matching a predicate.
 */
export function countOnBoard(
  player: PlayerSlot,
  predicate: (card: CardInstance) => boolean,
): number {
  return thenBoard(player).filter(predicate).length;
}

// =============================================================================
// STATE SNAPSHOT HELPERS
// =============================================================================

/**
 * Capture a deterministic snapshot of the current state.
 * Useful for before/after comparisons.
 */
export function captureStateSnapshot(): {
  firstHP: number;
  secondHP: number;
  firstBoardSize: number;
  secondBoardSize: number;
  firstHandSize: number;
  secondHandSize: number;
} {
  return {
    firstHP: getHP(state, "first"),
    secondHP: getHP(state, "second"),
    firstBoardSize: getBoard(state, "first").length,
    secondBoardSize: getBoard(state, "second").length,
    firstHandSize: getHand(state, "first").length,
    secondHandSize: getHand(state, "second").length,
  };
}
