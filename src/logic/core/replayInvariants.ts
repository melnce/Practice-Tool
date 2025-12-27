// src/logic/core/replayInvariants.ts
import type { GameState, Player, EffectOp } from "../../core/types/index.js";
import type { EffectTraceEvent } from "./effects/trace.js";
import { getHand, getBoard, getDeck, getGraveyard, getHP } from "../../core/playerHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Error Type
// ─────────────────────────────────────────────────────────────────────────────

export class ReplayInvariantError extends Error {
  constructor(
    public readonly invariantId: string,
    public readonly scenarioId: string,
    message: string,
  ) {
    super(message);
    this.name = "ReplayInvariantError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Core Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayInvariantInput {
  scenarioId: string;
  initialState: GameState;
  finalState: GameState;
  trace: readonly EffectTraceEvent[];
}

export interface ReplayInvariant {
  id: string;
  description: string;
  check(input: {
    scenarioId: string;
    initialState: GameState;
    finalState: GameState;
    trace: readonly EffectTraceEvent[];
    meta?: Record<string, any>;
  }): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPlayerState(state: GameState, player: Player) {
  return {
    hand: getHand(state, player),
    board: getBoard(state, player),
    deck: getDeck(state, player),
    graveyard: getGraveyard(state, player),
    leaderHealth: getHP(state, player),
  };
}

type Zone = "hand" | "board" | "graveyard" | "deck";

function countCardInZone(
  state: GameState,
  player: Player,
  zone: Zone,
  cardName: string,
): number {
  const pState = getPlayerState(state, player);
  let collection: { name: string }[] = [];

  if (zone === "hand") collection = pState.hand;
  else if (zone === "board") collection = pState.board;
  else if (zone === "graveyard") collection = pState.graveyard;
  else if (zone === "deck") collection = pState.deck;

  return collection.filter((c) => c.name === cardName).length;
}

/**
 * Invariant: A specific card moved between zones (by checking counts).
 * Uses metadata to resolve the card name dynamically.
 */
export function invCardMoved(
  idSuffix: string,
  options: {
    metaKey: string; // Key in meta to find card name
    player: Player;
    fromZone: Zone;
    toZone: Zone;
    count?: number; // Default 1
  },
): ReplayInvariant {
  const { metaKey, player, fromZone, toZone, count = 1 } = options;
  return {
    id: `card_moved_${idSuffix}`,
    description: `Card defined by meta.${metaKey} moved from ${fromZone} to ${toZone}`,
    check({ initialState, finalState, meta, scenarioId }) {
      if (!meta || typeof meta[metaKey] !== "string") {
        throw new ReplayInvariantError(
          `card_moved_${idSuffix}`,
          scenarioId,
          `Missing or invalid meta key "${metaKey}". Meta: ${JSON.stringify(meta)}`,
        );
      }
      const cardName = meta[metaKey];

      // Check From Zone
      const initialFromCount = countCardInZone(
        initialState,
        player,
        fromZone,
        cardName,
      );
      const finalFromCount = countCardInZone(
        finalState,
        player,
        fromZone,
        cardName,
      );
      const expectedFrom = initialFromCount - count;

      if (finalFromCount !== expectedFrom) {
        throw new ReplayInvariantError(
          `card_moved_${idSuffix}`,
          scenarioId,
          `Expected ${cardName} count in ${fromZone} to decrease by ${count} (Start: ${initialFromCount}, Expected: ${expectedFrom}, Actual: ${finalFromCount})`,
        );
      }

      // Check To Zone
      const initialToCount = countCardInZone(
        initialState,
        player,
        toZone,
        cardName,
      );
      const finalToCount = countCardInZone(
        finalState,
        player,
        toZone,
        cardName,
      );
      const expectedTo = initialToCount + count;

      if (finalToCount !== expectedTo) {
        throw new ReplayInvariantError(
          `card_moved_${idSuffix}`,
          scenarioId,
          `Expected ${cardName} count in ${toZone} to increase by ${count} (Start: ${initialToCount}, Expected: ${expectedTo}, Actual: ${finalToCount})`,
        );
      }
    },
  };
}

/**
 * Invariant: A specific card defined by UID moved zones.
 * Validates that card with UID is NOT in `fromZone` and IS in `toZone`.
 */
export function invCardMovedByUid(
  idSuffix: string,
  options: {
    metaKey: string; // Key in meta holding the UID
    player: Player;
    fromZone: "hand" | "board" | "deck";
    toZone: "hand" | "board" | "graveyard" | "deck";
  },
): ReplayInvariant {
  const { metaKey, player, fromZone, toZone } = options;
  return {
    id: `card_moved_uid_${idSuffix}`,
    description: `Card with UID from meta.${metaKey} moved from ${fromZone} to ${toZone}`,
    check({ finalState, meta, scenarioId }) {
      if (!meta || typeof meta[metaKey] !== "string") {
        throw new ReplayInvariantError(
          `card_moved_uid_${idSuffix}`,
          scenarioId,
          `Missing or invalid meta key "${metaKey}". Meta: ${JSON.stringify(meta)}`,
        );
      }
      const uid = meta[metaKey];

      // Check From Zone (Should NOT contain UID)
      const pState = getPlayerState(finalState, player);

      const getCollection = (z: string) => {
        if (z === "hand") return pState.hand;
        if (z === "board") return pState.board;
        if (z === "graveyard") return pState.graveyard;
        if (z === "deck") return pState.deck;
        return [];
      };

      const inFrom = getCollection(fromZone).some((c) => c.uid === uid);
      if (inFrom) {
        throw new ReplayInvariantError(
          `card_moved_uid_${idSuffix}`,
          scenarioId,
          `Expected card ${uid} to leave ${fromZone}, but it is still there.`,
        );
      }

      const inTo = getCollection(toZone).some((c) => c.uid === uid);
      if (!inTo) {
        throw new ReplayInvariantError(
          `card_moved_uid_${idSuffix}`,
          scenarioId,
          `Expected card ${uid} to be in ${toZone}, but it was not found.`,
        );
      }
    },
  };
}

/**
 * Assert leader health equals expected value.
 */
export function invLeaderHealth(
  idSuffix: string,
  player: Player,
  expected: number,
): ReplayInvariant {
  return {
    id: `leader_health_${player}_${idSuffix}`,
    description: `Assert ${player} leader health is ${expected}`,
    check({ scenarioId, finalState }) {
      const actual = getHP(finalState, player);
      if (actual !== expected) {
        throw new ReplayInvariantError(
          `leader_health_${player}_${idSuffix}`,
          scenarioId,
          `Expected ${player} health to be ${expected}, but got ${actual}`,
        );
      }
    },
  };
}

/**
 * Assert hand size equals expected value.
 */
export function invHandSize(
  idSuffix: string,
  player: Player,
  expected: number,
): ReplayInvariant {
  return {
    id: `hand_size_${player}_${idSuffix}`,
    description: `Assert ${player} hand size is ${expected}`,
    check({ scenarioId, finalState }) {
      const hand = getHand(finalState, player);
      if (hand.length !== expected) {
        throw new ReplayInvariantError(
          `hand_size_${player}_${idSuffix}`,
          scenarioId,
          `Expected ${player} hand size to be ${expected}, but got ${hand.length}`,
        );
      }
    },
  };
}

/**
 * Assert board size equals expected value.
 */
export function invBoardSize(
  idSuffix: string,
  player: Player,
  expected: number,
): ReplayInvariant {
  return {
    id: `board_size_${player}_${idSuffix}`,
    description: `Assert ${player} board size is ${expected}`,
    check({ scenarioId, finalState }) {
      const board = getBoard(finalState, player);
      if (board.length !== expected) {
        throw new ReplayInvariantError(
          `board_size_${player}_${idSuffix}`,
          scenarioId,
          `Expected ${player} board size to be ${expected}, but got ${board.length}`,
        );
      }
    },
  };
}

/**
 * Assert count of cards with name in specific zone.
 */
export function invCardCountInZone(
  idSuffix: string,
  params: {
    player: Player;
    zone: "hand" | "board" | "graveyard";
    name: string;
    expected: number;
  },
): ReplayInvariant {
  const { player, zone, name, expected } = params;
  return {
    id: `card_count_${zone}_${player}_${idSuffix}`,
    description: `Assert ${player} has ${expected} copies of "${name}" in ${zone}`,
    check({ scenarioId, finalState }) {
      const pState = getPlayerState(finalState, player);
      let collection: { name: string }[] = [];

      if (zone === "hand") collection = pState.hand;
      else if (zone === "board") collection = pState.board;
      else if (zone === "graveyard") collection = pState.graveyard;

      const count = collection.filter((c) => c.name === name).length;

      if (count !== expected) {
        throw new ReplayInvariantError(
          `card_count_${zone}_${player}_${idSuffix}`,
          scenarioId,
          `Expected ${expected} copies of "${name}" in ${player}'s ${zone}, but found ${count}`,
        );
      }
    },
  };
}

/**
 * Assert count of specific effect operations in the trace.
 */
export function invEffectCount(
  idSuffix: string,
  params: { op: EffectOp; expected: number },
): ReplayInvariant {
  const { op, expected } = params;
  return {
    id: `effect_count_${op}_${idSuffix}`,
    description: `Assert operation "${op}" occurred ${expected} times`,
    check({ scenarioId, trace }) {
      let count = 0;
      for (const event of trace) {
        if (event.kind === "effect_start" && event.op === op) {
          count++;
        }
      }

      if (count !== expected) {
        throw new ReplayInvariantError(
          `effect_count_${op}_${idSuffix}`,
          scenarioId,
          `Expected operation "${op}" to occur ${expected} times, but found ${count}`,
        );
      }
    },
  };
}















