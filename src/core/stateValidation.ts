import type { GameState, CardInstance } from "./types.js";

export interface GameStateValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateGameState(state: GameState): GameStateValidationResult {
  const issues: string[] = [];

  if (!state || typeof state !== "object") {
    return { valid: false, issues: ["State is null or not an object"] };
  }

  // 1. Check critical arrays exist in nested player structure
  if (!state.players?.first || !state.players?.second) {
    issues.push("Missing players.first or players.second");
    return { valid: false, issues };
  }

  const arrayFieldsFirst = ["hand", "board", "deck", "graveyard"] as const;
  const arrayFieldsSecond = ["hand", "board", "deck", "graveyard"] as const;

  for (const field of arrayFieldsFirst) {
    if (!Array.isArray(state.players.first[field])) {
      issues.push(`Missing or invalid array: players.first.${field}`);
    } else {
      // Check for nulls/undefined in arrays
      const arr = state.players.first[field] as any[];
      for (let i = 0; i < arr.length; i++) {
        if (!arr[i]) {
          issues.push(`Null/undefined entry in players.first.${field} at index ${i}`);
        }
      }
    }
  }

  for (const field of arrayFieldsSecond) {
    if (!Array.isArray(state.players.second[field])) {
      issues.push(`Missing or invalid array: players.second.${field}`);
    } else {
      // Check for nulls/undefined in arrays
      const arr = state.players.second[field] as any[];
      for (let i = 0; i < arr.length; i++) {
        if (!arr[i]) {
          issues.push(`Null/undefined entry in players.second.${field} at index ${i}`);
        }
      }
    }
  }

  // 2. Check Instance ID uniqueness (only across active zones where collision matters most)
  const activeZones = [
    { player: "first" as const, fields: ["hand", "board"] as const },
    { player: "second" as const, fields: ["hand", "board"] as const },
  ];
  const seenIds = new Set<string | number>();

  for (const { player, fields } of activeZones) {
    for (const field of fields) {
      const arr = state.players[player][field] as CardInstance[];
      if (Array.isArray(arr)) {
        for (const c of arr) {
          if (c && c.instanceId !== undefined) {
            if (seenIds.has(c.instanceId)) {
              issues.push(
                `Duplicate instanceId ${c.instanceId} found in players.${player}.${field}`,
              );
            }
            seenIds.add(c.instanceId);
          }
        }
      }
    }
  }

  // 3. Check numeric bounds (conservative) - using nested structure
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
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      issues.push(`Invalid numeric field ${name}: ${val}`);
    }
  }

  // HP can be negative (death), but must be finite number
  if (typeof state.players.first.hp !== "number" || !Number.isFinite(state.players.first.hp))
    issues.push(`Invalid first.hp: ${state.players.first.hp}`);
  if (typeof state.players.second.hp !== "number" || !Number.isFinite(state.players.second.hp))
    issues.push(`Invalid second.hp: ${state.players.second.hp}`);

  // 4. Board size invariant (max 5 followers)
  const BOARD_MAX = 5;
  if (Array.isArray(state.players.first.board) && state.players.first.board.length > BOARD_MAX) {
    issues.push(`First player board overflow: ${state.players.first.board.length} > ${BOARD_MAX}`);
  }
  if (Array.isArray(state.players.second.board) && state.players.second.board.length > BOARD_MAX) {
    issues.push(`Second player board overflow: ${state.players.second.board.length} > ${BOARD_MAX}`);
  }

  // 5. activePlayer validation (single source of truth)
  if (state.activePlayer !== "first" && state.activePlayer !== "second") {
    issues.push(`Invalid activePlayer: ${state.activePlayer}`);
  }

  // 6. Defense type validation (should be number, not string)
  const boards = [
    { name: "first.board", arr: state.players.first.board },
    { name: "second.board", arr: state.players.second.board },
  ];
  for (const { name, arr } of boards) {
    if (Array.isArray(arr)) {
      for (const card of arr) {
        if (card && card.type === "Follower") {
          if (typeof card.defense !== "number") {
            issues.push(
              `${name}: card "${card.name}" has non-numeric defense: ${typeof card.defense}`
            );
          }
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidGameState(
  state: GameState,
  context: string = "",
): void {
  const result = validateGameState(state);
  if (!result.valid) {
    const msg =
      `Invalid GameState${context ? ` (${context})` : ""}:\n` +
      result.issues.map((i) => `- ${i}`).join("\n");
    throw new Error(msg);
  }
}
