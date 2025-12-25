// src/logic/core/cardFilter/types.ts
// Shared types for card filtering logic.

import { CardInstance } from "../../../core/types/index.js";

/**
 * Raw filter specification as used in effect definitions.
 * All fields are optional.
 */
export interface CardFilterSpec {
  name?: string; // Filter by card name (exact match)
  type?: string;
  class?: string;

  cost_eq?: number | string;
  cost_lte?: number | string;
  cost_gte?: number | string;

  attack_eq?: number | string;
  attack_lte?: number | string;
  attack_gte?: number | string;

  defense_eq?: number | string;
  defense_lte?: number | string;
  defense_gte?: number | string;

  // Tribe can be specified multiple ways (aliases)
  tribe?: string;
  tribes?: string | string[];
  tribe_in?: string | string[];
  tribes_in?: string | string[];
}

/**
 * Normalized filter with all aliases resolved.
 */
export interface NormalizedCardFilter {
  name: string | null; // Exact name match (lowercase)
  type: string | null;
  class: string | null;

  costEq: number | null;
  costLte: number | null;
  costGte: number | null;

  atkEq: number | null;
  atkLte: number | null;
  atkGte: number | null;

  defEq: number | null;
  defLte: number | null;
  defGte: number | null;

  tribeList: string[];
}

export type CardPredicate = (card: CardInstance) => boolean;















