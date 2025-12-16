import { logEvent } from "./logger.js";
import { GameState } from "./types.js";

// -- 1. Canonical Defaults (Single Source of Truth) --
// We strictly define all scalar defaults here. This object is spread
// into the initial state and used to reset scalars.
const DEFAULTS = {
  blueHP: 20, redHP: 20,
  blueMaxHP: 20, redMaxHP: 20,
  bluePP: 1, redPP: 1,
  blueMaxPP: 1, redMaxPP: 1,
  bluePermPP: 0, redPermPP: 0,
  blueShadows: 0,
  redShadows: 0,

  blueRally: 0,
  redRally: 0,

  isBlueTurn: true,
  roundCount: 1,

  // Evolution
  blueEvoCharges: 2,
  redEvoCharges: 2,
  blueSuperEvoCharges: 2,
  redSuperEvoCharges: 2,

  blueEvoUsedThisTurn: false,
  redEvoUsedThisTurn: false,
  blueEvoCount: 0,
  redEvoCount: 0,

  // Dragoncraft specific
  redBoostUsedEarly: false,
  redBoostUsedLate: false,
  redBoostPending: false,

  bluePlaysThisTurn: 0,
  redPlaysThisTurn: 0,
  blueChooseBonus: 0,
  redChooseBonus: 0,

  gameStarted: false,

  blueAnyAllyAttackedThisTurn: false,
  redAnyAllyAttackedThisTurn: false,

  // Dynamic / Optional fields (Explicitly reset to undefined/null)
  lastFuse: undefined,
  pendingTargetEffect: undefined,

  deckoutWinsBlue: undefined,
  deckoutWinsRed: undefined,
  blueLeaderBarrier: undefined,
  redLeaderBarrier: undefined,
} as const;

// -- 2. Array Keys (Identity Preservation) --
// We list all array keys here. createInitialState allocates them once.
// resetGameState clears them in-place (length = 0) effectively preserving identity.
// Type enforced to be keys of GameState.
// Type enforced to be keys of GameState where the value extends any[].
type ArrayKey = {
  [K in keyof GameState]-?: GameState[K] extends any[] ? K : never
}[keyof GameState];

const ARRAY_KEYS: readonly ArrayKey[] = [
  "blueDeck", "redDeck",
  "blueHand", "redHand",
  "blueBoard", "redBoard",
  "blueGraveyard", "redGraveyard",
  "bluePlayedHistory", "redPlayedHistory",
  "blueDestroyedHistory", "redDestroyedHistory",
  "blueCrests", "redCrests",
  "shikigamiDeathsThisTurnBlue", "shikigamiDeathsThisTurnRed",
  "lastSummoned",
  "lastDrawnCards"
];

// -- 3. Factory --
export function createInitialState(): GameState {
  // Explicit object literal assignment to ensure Type Safety without 'as any'
  return {
    ...DEFAULTS,

    // Arrays (allocated exactly once)
    blueDeck: [],
    redDeck: [],
    blueHand: [],
    redHand: [],
    blueBoard: [],
    redBoard: [],
    blueGraveyard: [],
    redGraveyard: [],
    bluePlayedHistory: [],
    redPlayedHistory: [],
    blueDestroyedHistory: [],
    redDestroyedHistory: [],
    blueCrests: [],
    redCrests: [],
    shikigamiDeathsThisTurnBlue: [],
    shikigamiDeathsThisTurnRed: [],
    lastSummoned: [],
    lastDrawnCards: [],

    // Debug Identity
    __debugId: Math.random()
  };
}

// -- 4. Exported Singleton --
export const state: GameState = createInitialState();

// -- 5. Reset Logic --
export function resetGameState(): void {
  // A) Clear arrays in-place
  // We assume strict invariants: these keys MUST exist and MUST be arrays.
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(state[key])) {
      throw new Error(`resetGameState: Critical invariant failed. Key '${key}' is not an array.`);
    }
    state[key].length = 0;
  }

  // B) Reset scalars
  Object.assign(state, DEFAULTS);

  // C) Debug Identity
  state.__debugId = Math.random();

  // Log
  logEvent("resetGameState", {});
}

// Global debug exposure (matches original)
if (typeof window !== "undefined") {
  (window as any).gameState = state;
  (window as any).debugSummon = () => import('../logic/effects/ops/summon.js');
}
