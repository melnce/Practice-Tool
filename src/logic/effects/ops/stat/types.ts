import { Effect, Player, CardInstance } from "../../../../core/types.js";

export interface StatContext {
  owner: Player;
  sourceCard: CardInstance | null;
  queue: any;
  context: any;
}

export type StatAction = "give" | "set";

export type StatOp = Effect & {
  // Action field - determines add (default) or set
  action?: StatAction;

  // Standard stat fields
  attack?: number | string;
  defense?: number | string;

  // Keyword fields
  keywords?: (string | { name: string; [key: string]: any })[];
  keyword?:
    | string
    | { name: string; [key: string]: any }
    | (string | { name: string; [key: string]: any })[];
  has_keyword?: string | string[];

  // Filters
  tribes?: string | string[];
  tribe?: string;
  name_filter?: string;
  name_in?: string[];
  include_self?: boolean;
  filter?: string; // "leftmost"

  // Special
  attacks_per_turn?: number | string;
  random?: boolean;
  count?: number | string;

  // Duration
  until_end_of_turn?: boolean;

  // Dynamic
  attack_source?: string;
  defense_source?: string;
  exclude_self?: boolean;
};

export function isStatBuff(op: StatOp): boolean {
  return (
    op.attack !== undefined ||
    op.defense !== undefined ||
    op.set_to !== undefined
  );
}

export function isKeywordBuff(op: StatOp): boolean {
  return (
    op.keywords !== undefined ||
    op.keyword !== undefined ||
    op.has_keyword !== undefined
  );
}

export function isSpecialBuff(op: StatOp): boolean {
  return op.attacks_per_turn !== undefined;
}
