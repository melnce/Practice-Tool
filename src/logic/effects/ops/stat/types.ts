import type {
  Effect,
  Player,
  CardInstance,
  EffectContext,
} from "../../../../core/types/index.js";

export interface StatContext {
  owner: Player;
  sourceCard: CardInstance | null;
  queue: Effect[];
  context: EffectContext;
}

export type StatAction = "give" | "set";

/** Allowed stat.action values — must match handleStatOrchestrator branches */
export const STAT_ACTION_VALUES = new Set(["give", "set"]);

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
  /** "leftmost" string, or an object condition merged into getPool (is_super_evolved, tribe, not_self, …). */
  filter?: string | Record<string, unknown>;

  // Special
  attacks_per_turn?: number | string;
  random?: boolean;
  count?: number | string;
  /** "highest" restricts the pool to cards tied for the maximum stat. */
  distribution?: "random" | "highest";
  /** Stat used by distribution: "highest" (defaults to attack). */
  stat?: "attack" | "defense" | "hp";
  /** Random auto-selection alias, including among highest-stat ties. */
  pick?: "random";
  select?: number | string;
  select_count?: number | string;

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
