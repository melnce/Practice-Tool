// src/logic/core/replayInit.ts
// ─────────────────────────────────────────────────────────────────────────────
// REPLAY-ONLY GAME INITIALIZATION - Core-safe, no UI, no fetch
// This provides deterministic game state with real cards for replay scenarios.
// ─────────────────────────────────────────────────────────────────────────────

import { state, resetStateInstance } from "../../core/gameState.js";
import type {
  CardInstance,
  GameState,
  Player,
} from "../../core/types/index.js";
import { drawCard } from "../../core/utils.js";
import {
  getCardDetails,
  isCardDatabaseInitialized,
} from "../../data/cardIndex.js";

// ─────────────────────────────────────────────────────────────────────────────
// Replay Deck Definitions - Using real card names from the database
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A replay deck is a list of card names.
 * Cards are looked up from the card database.
 */
export interface ReplayDeckDef {
  id: string;
  cards: readonly string[];
}

// Standard test deck using real cards that exist in the database
// These are stable, simple cards for testing basic mechanics
const REPLAY_DECK_STANDARD: ReplayDeckDef = {
  id: "standard",
  cards: [
    // Low cost followers (1-2 PP) - RESTORED ORDER
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin",
    "Goblin", // Replaced Water Fairy
    "May, Journey Elf",
    "May, Journey Elf",
    "Flashstep Quickblader",
    "Flashstep Quickblader",
    "Indomitable Fighter",
    "Indomitable Fighter",
    // Mid cost (3 PP)
    "Vigilant Detective",
    "Vigilant Detective",
    "Vigilant Detective",
    // Spells
    "Bug Alert",
    "Bug Alert",
    "Foresight",
    // Higher cost
    "Centaur Centurion",
    "Centaur Centurion",
    "Silvercloud Dragonrider",
  ],
};

// Spell-heavy deck for testing spell mechanics
const REPLAY_DECK_SPELL_HEAVY: ReplayDeckDef = {
  id: "spell_heavy",
  cards: [
    "Bug Alert",
    "Bug Alert",
    "Foresight",
    "Goblin",
    "Goblin",
    "May, Journey Elf",
    "May, Journey Elf",
    "Flashstep Quickblader",
    "Indomitable Fighter",
    "Vigilant Detective",
    "Silvercloud Dragonrider",
  ],
};

const REPLAY_DECKS: Record<string, ReplayDeckDef> = {
  standard: REPLAY_DECK_STANDARD,
  spell_heavy: REPLAY_DECK_SPELL_HEAVY,
};

// ─────────────────────────────────────────────────────────────────────────────
// Deck Building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a deck from card names.
 * Each card gets a unique UID from the seeded RNG.
 */
function buildDeckFromNames(
  cardNames: readonly string[],
  rng: any,
  strict: boolean = false,
): CardInstance[] {
  const deck: CardInstance[] = [];
  const missing: string[] = [];

  for (const name of cardNames) {
    const template = getCardDetails(name);
    if (!template) {
      if (strict) {
        missing.push(name);
      } else {
        console.warn(`[ReplayInit] Card not found: "${name}" - skipping`);
      }
      continue;
    }

    // Create card instance with unique UID
    const card: CardInstance = {
      ...template,
      uid: rng.makeUid(),
    } as CardInstance;

    deck.push(card);
  }

  if (strict && missing.length > 0) {
    const uniqueMissing = [...new Set(missing)];
    throw new Error(
      `[ReplayInit] Strict Mode Failure: The following cards were not found in the database: ${uniqueMissing.join(", ")} `,
    );
  }

  return deck;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayInitOptions {
  seed: number;
  /** Which deck to use. Default: "standard" */
  deckId?: "standard" | "spell_heavy" | "empty";
  /** Starting PP for both players. Default: 1 */
  startingPP?: number;
  /** Cards to draw initially. Default: 3 */
  initialDraw?: number;
  /** If true, throws error on missing cards instead of logging warnings. Default: false */
  strict?: boolean;
}

/**
 * Initialize game state for replay testing.
 * This is a pure, headless initialization that doesn't require network or DOM.
 *
 * IMPORTANT: The card database must be initialized before calling this function.
 * In Node.js, call initCardDatabaseNode() first.
 *
 * @param targetState Optional state instance to initialize. Defaults to the singleton `state`.
 */
export function initReplayState(
  options: ReplayInitOptions,
  targetState?: GameState,
): GameState {
  const {
    seed,
    deckId = "standard",
    startingPP = 1,
    initialDraw = 3,
    strict = false,
  } = options;
  const s = targetState || state;

  // Reset to clean state
  resetStateInstance(s, seed);

  // Set up PP (using nested player state)
  s.players.first.pp = startingPP;
  s.players.first.maxPP = startingPP;
  s.players.second.pp = startingPP;
  s.players.second.maxPP = startingPP;

  if (deckId === "empty") {
    // Empty decks for minimal testing
    s.gameStarted = true;
    return s;
  }

  // Check if card database is initialized
  if (!isCardDatabaseInitialized()) {
    console.warn(
      "[ReplayInit] Card database not initialized - using empty decks",
    );
    s.gameStarted = true;
    return s;
  }

  // Get deck definition (standard is guaranteed to exist)
  const deckDef = REPLAY_DECKS[deckId] ?? REPLAY_DECK_STANDARD;

  // Build decks from card names
  const firstDeck = buildDeckFromNames(deckDef.cards, s.rng, strict);
  const secondDeck = buildDeckFromNames(deckDef.cards, s.rng, strict);

  // Shuffle using seeded RNG - FIX: Shuffle returns a copy, we must use it!
  const firstShuffled = s.rng.shuffle(firstDeck);
  const secondShuffled = s.rng.shuffle(secondDeck);

  // Load decks (use nested player state)
  s.players.first.deck.push(...firstShuffled);
  s.players.second.deck.push(...secondShuffled);

  if (initialDraw > 0) {
    // console.log(`[ReplayInit] FirstDeck Size: ${s.players.first.deck.length}. Top 5: ${s.players.first.deck.slice(0, 5).map(c => c.name).join(", ")} `);
  }

  // Draw initial hands (use nested player state)
  for (let i = 0; i < initialDraw; i++) {
    drawCard(s.players.first.hand, s.players.first.deck, "first");
    drawCard(s.players.second.hand, s.players.second.deck, "second");
  }

  s.gameStarted = true;
  s.activePlayer = "first";

  return s;
}

// Import playerHelpers for PP operations
import { setPP as setPPHelper, setMaxPP } from "../../core/playerHelpers.js";

/**
 * Helper to set PP for testing specific PP levels
 */
export function setPP(player: Player, current: number, max?: number): void {
  setPPHelper(state, player, current);
  setMaxPP(state, player, max ?? current);
}
