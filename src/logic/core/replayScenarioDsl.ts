// src/logic/core/replayScenarioDsl.ts
// ─────────────────────────────────────────────────────────────────────────────
// REPLAY SCENARIO DSL - Selectors and action builders for UID-free scenarios
// ─────────────────────────────────────────────────────────────────────────────

import type {
  GameState,
  CardInstance,
  Player,
  PlayCardAction,
  AttackAction,
  ChooseTargetAction,
  TargetSpec,
} from "../../core/types/index.js";
import { getHand, getBoard } from "../../core/playerHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Selector Options
// ─────────────────────────────────────────────────────────────────────────────

export interface CardSelector {
  /** Match by exact UID */
  uid?: string;
  /** Match by card name (exact or partial) */
  name?: string;
  /** Match by cost */
  cost?: number;
  /** Match by card type */
  cardType?: "Follower" | "Spell" | "Amulet";
  /** Match by index in the zone (0-based) */
  index?: number;
}

export interface BoardSelector extends CardSelector {
  owner: Player;
}

export interface TargetSelector {
  owner?: Player;
  zone: "board" | "leader";
  /** For board targets */
  index?: number;
  name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select a card from the player's hand.
 * Throws with descriptive error if not found.
 *
 * Logic:
 * 1. If UID provided, match exactly.
 * 2. Filter hand by name/cost/type.
 * 3. If index is provided, select the N-th match from the candidates.
 * 4. If index is NOT provided, require exactly one match.
 */
export function selectCardInHand(
  state: GameState,
  owner: Player,
  selector: CardSelector,
): CardInstance {
  const hand = getHand(state, owner);

  // 0. UID Match (Fast path, exact)
  if (selector.uid) {
    const match = hand.find((c) => c.uid === selector.uid);
    if (!match) {
      throw new Error(
        `selectCardInHand: No card found with UID ${selector.uid} for ${owner}.`,
      );
    }
    return match;
  }

  // 1. Filter by Name/Cost/Type logic
  const candidates = hand.filter((card) => {
    if (selector.name !== undefined && !card.name.includes(selector.name))
      return false;
    if (selector.cost !== undefined && Number(card.cost) !== selector.cost)
      return false;
    if (selector.cardType !== undefined && card.type !== selector.cardType)
      return false;
    return true;
  });

  if (candidates.length === 0) {
    const available = hand
      .map((c, i) => `[${i}] ${c.name} (${c.type}, cost ${c.cost})`)
      .join(", ");
    throw new Error(
      `selectCardInHand: No card found matching criteria ${JSON.stringify(selector)} for ${owner}.\n` +
        `Available cards: ${available || "(empty hand)"}`,
    );
  }

  // 2. Apply Index (Relative)
  if (selector.index !== undefined) {
    if (selector.index < 0 || selector.index >= candidates.length) {
      throw new Error(
        `selectCardInHand: Index ${selector.index} out of bounds for matches of ${JSON.stringify(selector)}.\n` +
          `Found ${candidates.length} matches.`,
      );
    }
    return candidates[selector.index]!;
  }

  // 3. Single Match Requirement
  if (candidates.length > 1) {
    const matches = candidates.map((c) => `${c.name} (${c.uid})`).join(", ");
    throw new Error(
      `selectCardInHand: Multiple cards match ${JSON.stringify(selector)} for ${owner}.\n` +
        `Matches: ${matches}\n` +
        `Specify 'index' to disambiguate (e.g. index: 0 for the first one).`,
    );
  }

  return candidates[0]!;
}

/**
 * Select a follower/amulet on the board.
 * Throws with descriptive error if not found.
 *
 * Logic: Same as selectCardInHand (Relative Indexing).
 */
export function selectFollowerOnBoard(
  state: GameState,
  selector: BoardSelector,
): CardInstance {
  const board = getBoard(state, selector.owner);

  const candidates = board.filter((card) => {
    if (selector.name !== undefined && !card.name.includes(selector.name))
      return false;
    if (selector.cost !== undefined && Number(card.cost) !== selector.cost)
      return false;
    if (selector.cardType !== undefined && card.type !== selector.cardType)
      return false;
    return true;
  });

  if (candidates.length === 0) {
    const available = board
      .map((c, i) => `[${i}] ${c.name} (${c.type}, cost ${c.cost})`)
      .join(", ");
    throw new Error(
      `selectFollowerOnBoard: No card found matching ${JSON.stringify(selector)} for ${selector.owner}.\n` +
        `Available on board: ${available || "(empty board)"}`,
    );
  }

  if (selector.index !== undefined) {
    if (selector.index < 0 || selector.index >= candidates.length) {
      throw new Error(
        `selectFollowerOnBoard: Index ${selector.index} out of bounds for matches of ${JSON.stringify(selector)}.\n` +
          `Found ${candidates.length} matches.`,
      );
    }
    return candidates[selector.index]!;
  }

  if (candidates.length > 1) {
    const matches = candidates.map((c) => `${c.name} (${c.uid})`).join(", ");
    throw new Error(
      `selectFollowerOnBoard: Multiple cards match ${JSON.stringify(selector)} for ${selector.owner}.\n` +
        `Matches: ${matches}\n` +
        `Specify 'index' to disambiguate.`,
    );
  }

  return candidates[0]!;
}

/**
 * Select a target (board card or leader).
 * Returns a TargetSpec suitable for action payloads.
 */
export function selectTarget(
  state: GameState,
  selector: TargetSelector,
): TargetSpec {
  if (selector.zone === "leader") {
    const player = selector.owner ?? "second"; // Default to enemy leader
    return { type: "leader", player };
  }

  // Board target
  const owner = selector.owner ?? "second";
  const boardSelector: BoardSelector = { owner };
  if (selector.index !== undefined) boardSelector.index = selector.index;
  if (selector.name !== undefined) boardSelector.name = selector.name;

  const card = selectFollowerOnBoard(state, boardSelector);
  return { type: "card", uid: card.uid };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a PLAY_CARD action by selecting from hand.
 */
export function playCard(
  state: GameState,
  owner: Player,
  selector: CardSelector,
): PlayCardAction {
  const card = selectCardInHand(state, owner, selector);
  return {
    type: "PLAY_CARD",
    player: owner,
    cardUid: card.uid,
  };
}

/**
 * Build an ATTACK action.
 */
export function attackAction(
  state: GameState,
  attackerOwner: Player,
  attackerSelector: CardSelector,
  targetSelector: TargetSelector,
): AttackAction {
  const attacker = selectFollowerOnBoard(state, {
    owner: attackerOwner,
    ...attackerSelector,
  });
  const defender = selectTarget(state, targetSelector);

  return {
    type: "ATTACK",
    player: attackerOwner,
    attackerUid: attacker.uid,
    defender,
  };
}

/**
 * Build a CHOOSE_TARGET action.
 */
export function chooseTarget(
  state: GameState,
  owner: Player,
  targetSelector: TargetSelector,
): ChooseTargetAction {
  const target = selectTarget(state, targetSelector);
  return {
    type: "CHOOSE_TARGET",
    player: owner,
    target,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper to list available cards (for debugging)
// ─────────────────────────────────────────────────────────────────────────────

export function describeHand(state: GameState, owner: Player): string {
  const hand = getHand(state, owner);
  return hand
    .map(
      (c, i) => `[${i}] ${c.name} (${c.type}, cost ${c.cost}, uid: ${c.uid})`,
    )
    .join("\n");
}

export function describeBoard(state: GameState, owner: Player): string {
  const board = getBoard(state, owner);
  return board
    .map(
      (c, i) => `[${i}] ${c.name} (${c.type}, cost ${c.cost}, uid: ${c.uid})`,
    )
    .join("\n");
}
