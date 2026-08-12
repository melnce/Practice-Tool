/**
 * Draw-only consistency / mulligan trainer types.
 * No game state, no play policy — shuffles and draws only.
 */

/** One physical card copy in a resolved deck list. */
export interface SimCard {
  /** Stable identity for matching (card name, else id string). */
  key: string;
  name: string;
  cost: number;
  id?: string;
}

export type Seat = "play" | "draw";

/** Opening hand size in Worlds Beyond (bible: Match Flow). */
export const OPENING_HAND_SIZE = 4;

/** Standard constructed deck size (bible: Match Flow). */
export const DECK_SIZE = 40;

/**
 * Condition DSL for "did I see X by turn T?"
 * Evaluated over the multiset of cards drawn so far (opening + turn draws),
 * not over a played board.
 */
export type Condition =
  | { kind: "cards"; keys: string[]; atLeast: number }
  | { kind: "costs"; costs: number[]; atLeast: number }
  | { kind: "and"; of: Condition[] }
  | { kind: "or"; of: Condition[] };

export type MulliganPolicyKind = "keep_all" | "keep_list";

export interface MulliganPolicy {
  kind: MulliganPolicyKind;
  /** For keep_list: card keys to keep when present in the opening hand. */
  keepKeys?: readonly string[];
}

export interface ConsistencyConfig {
  /** On the play (first) or on the draw (second). Draw counts match in WB. */
  seat: Seat;
  mulligan: MulliganPolicy;
  /** Inclusive turn horizon (P after the start-of-turn draw on this turn). */
  turnHorizon: number;
  iterations: number;
  seed: number | string;
}

export interface ConsistencyResult {
  seed: number;
  iterations: number;
  turnHorizon: number;
  /** Index 0 unused; probs[t] = P(condition) after turn-t draw, t=1..horizon. */
  probabilityByTurn: number[];
  /** P(condition) on the post-mulligan opening hand (before turn-1 draw). */
  probabilityOpening: number;
  elapsedMs: number;
}

export interface DrillDeal {
  seed: number;
  /** Full shuffled deck order (keys) before dealing. */
  deckOrder: SimCard[];
  opening: SimCard[];
}

export interface DrillPath {
  label: string;
  /** Hand after mulligan resolution. */
  hand: SimCard[];
  /** Next N turn draws (turn 1 .. N). */
  draws: SimCard[];
  /** Cards seen = hand + draws. */
  seen: SimCard[];
}

export interface DrillReveal {
  seed: number;
  opening: SimCard[];
  keepIndices: number[];
  yourPath: DrillPath;
  /** Keep-everything path on the same initial shuffle (no reshuffle). */
  keepAllPath: DrillPath;
  turns: number;
}

export const CRAFT_CLASSES = [
  "Forestcraft",
  "Swordcraft",
  "Runecraft",
  "Dragoncraft",
  "Havencraft",
  "Portalcraft",
  "Abysscraft",
] as const;

export type CraftClass = (typeof CRAFT_CLASSES)[number];
