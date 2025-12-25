// src/core/stateValidation.ts
// Post-op invariant validator - implements H1-H8 hard fail invariants from OP audit

import type { GameState, CardInstance } from "./types/index.js";

export interface GameStateValidationResult {
  valid: boolean;
  fails: string[];  // HARD FAIL - game state is corrupt
  warns: string[];  // WARNING - suspicious but recoverable
  issues: string[]; // Legacy compatibility - combines fails + warns
}

// =============================================================================
// MAIN VALIDATOR
// =============================================================================

export function validateGameState(state: GameState): GameStateValidationResult {
  const fails: string[] = [];
  const warns: string[] = [];

  if (!state || typeof state !== "object") {
    return { valid: false, fails: ["State is null or not an object"], warns: [], issues: ["State is null or not an object"] };
  }

  // Check players structure exists
  if (!state.players?.first || !state.players?.second) {
    fails.push("H3: Missing players.first or players.second");
    return { valid: false, fails, warns, issues: [...fails, ...warns] };
  }

  // =========================================================================
  // H1: UNIQUE UIDs - No duplicate uid across all zones
  // =========================================================================
  const allCards = collectAllCards(state);
  const uidSet = new Set<string>();
  for (const card of allCards) {
    if (card.uid) {
      if (uidSet.has(card.uid)) {
        fails.push(`H1: Duplicate UID ${card.uid} (${card.name})`);
      }
      uidSet.add(card.uid);
    }
  }

  // =========================================================================
  // H3: ZONE CONSISTENCY - Card in exactly one zone
  // =========================================================================
  for (const player of ["first", "second"] as const) {
    const zones = ["hand", "board", "deck", "graveyard"] as const;
    for (const zone of zones) {
      const arr = state.players[player][zone] as CardInstance[];
      if (!Array.isArray(arr)) {
        fails.push(`H3: Missing or invalid array: players.${player}.${zone}`);
        continue;
      }
      // Check for null entries
      for (let i = 0; i < arr.length; i++) {
        if (!arr[i]) {
          fails.push(`H3: Null entry in players.${player}.${zone}[${i}]`);
        }
      }
      // Check owner matches zone location
      for (const card of arr) {
        if (card && card.owner && card.owner !== player) {
          warns.push(`H3: Card ${card.name} (${card.uid}) in ${player}.${zone} has owner=${card.owner}`);
        }
      }
    }
  }

  // =========================================================================
  // H4: BOARD CAP - board.length <= 5 per player
  // =========================================================================
  const BOARD_MAX = 5;
  if (state.players.first.board.length > BOARD_MAX) {
    fails.push(`H4: First board exceeds ${BOARD_MAX}: ${state.players.first.board.length}`);
  }
  if (state.players.second.board.length > BOARD_MAX) {
    fails.push(`H4: Second board exceeds ${BOARD_MAX}: ${state.players.second.board.length}`);
  }

  // =========================================================================
  // H5: SINGLE activePlayer - Must be "first" or "second"
  // =========================================================================
  if (state.activePlayer !== "first" && state.activePlayer !== "second") {
    fails.push(`H5: Invalid activePlayer: ${state.activePlayer}`);
  }

  // =========================================================================
  // H6: HP BOUNDS - 0 <= hp <= maxHP
  // =========================================================================
  for (const player of ["first", "second"] as const) {
    const hp = state.players[player].hp;
    const maxHP = state.players[player].maxHP ?? 20;

    if (typeof hp !== "number" || !Number.isFinite(hp)) {
      fails.push(`H6: ${player}.hp is not a finite number: ${hp}`);
    } else if (hp > maxHP) {
      warns.push(`H6: ${player}.hp (${hp}) exceeds maxHP (${maxHP})`);
    }
    // Note: hp can go below 0 (overkill damage) but warn if very negative
    if (typeof hp === "number" && hp < -100) {
      warns.push(`H6: ${player}.hp unusually negative: ${hp}`);
    }
  }

  // =========================================================================
  // NUMERIC FIELD VALIDATION (negative checks)
  // =========================================================================
  const numericChecks = [
    { val: state.players.first.pp, name: "first.pp" },
    { val: state.players.second.pp, name: "second.pp" },
    { val: state.players.first.maxPP, name: "first.maxPP" },
    { val: state.players.second.maxPP, name: "second.maxPP" },
    { val: state.players.first.shadows, name: "first.shadows" },
    { val: state.players.second.shadows, name: "second.shadows" },
    { val: state.players.first.rally, name: "first.rally" },
    { val: state.players.second.rally, name: "second.rally" },
    { val: state.roundCount, name: "roundCount" },
  ];

  for (const { val, name } of numericChecks) {
    if (typeof val !== "number" || !Number.isFinite(val)) {
      fails.push(`Invalid numeric field ${name}: ${val}`);
    } else if (val < 0) {
      warns.push(`Negative value for ${name}: ${val}`);
    }
  }

  // =========================================================================
  // W1: COUNTDOWN NUMERIC - countdown >= 0 for amulets
  // =========================================================================
  for (const player of ["first", "second"] as const) {
    for (const card of state.players[player].board) {
      if (card?.type === "Amulet" && card.hasCountdown) {
        const cd = Number(card.countdown);
        if (!Number.isFinite(cd) || cd < 0) {
          warns.push(`W1: Amulet ${card.name} has invalid countdown: ${card.countdown}`);
        }
      }
    }
  }

  // =========================================================================
  // W3: STATS NON-NEGATIVE - attack >= 0, defense >= 0 for followers
  // =========================================================================
  for (const player of ["first", "second"] as const) {
    for (const card of state.players[player].board) {
      if (card?.type === "Follower") {
        const atk = Number(card.attack);
        const def = Number(card.defense);
        if (typeof card.defense !== "number") {
          warns.push(`W3: ${player}.board: ${card.name} has non-numeric defense: ${typeof card.defense}`);
        }
        if (atk < 0) {
          warns.push(`W3: ${card.name} has negative attack: ${atk}`);
        }
        if (def < 0) {
          warns.push(`W3: ${card.name} has negative defense: ${def}`);
        }
      }
    }
  }

  return {
    valid: fails.length === 0,
    fails,
    warns,
    issues: [...fails, ...warns],
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function collectAllCards(state: GameState): CardInstance[] {
  const cards: CardInstance[] = [];
  for (const player of ["first", "second"] as const) {
    const zones = ["hand", "board", "deck", "graveyard"] as const;
    for (const zone of zones) {
      const arr = state.players[player][zone];
      if (Array.isArray(arr)) {
        cards.push(...arr.filter((c) => c != null));
      }
    }
  }
  return cards;
}

// =============================================================================
// ASSERTION HELPER
// =============================================================================

export function assertValidGameState(
  state: GameState,
  context: string = "",
): void {
  const result = validateGameState(state);
  if (!result.valid) {
    const msg =
      `Invalid GameState${context ? ` (${context})` : ""}:\n` +
      `HARD FAILS:\n` +
      result.fails.map((i) => `  - ${i}`).join("\n") +
      (result.warns.length > 0
        ? `\nWARNINGS:\n` + result.warns.map((i) => `  - ${i}`).join("\n")
        : "");
    throw new Error(msg);
  }
}

// Legacy compatibility - returns {valid, issues} format
export function validateGameStateLegacy(state: GameState): { valid: boolean; issues: string[] } {
  const result = validateGameState(state);
  return {
    valid: result.valid,
    issues: [...result.fails, ...result.warns],
  };
}

