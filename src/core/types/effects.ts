// =============================================================================
// EFFECT TYPES
// =============================================================================

import type { CardInstance } from "./cards.js";
import type { Player } from "./player.js";

// Re-export EffectOp from domain definitions (type-only to avoid circular dep)
export type { EffectOp } from "../../logic/core/effects/opTypes.js";
import type { EffectOp } from "../../logic/core/effects/opTypes.js";

// =============================================================================
// BASE EFFECT INTERFACE
// =============================================================================

/**
 * Common fields for all effects.
 * Note: Index signature allows extended interfaces to add their own fields.
 * Type safety is enforced at the handler level via EffectContext.
 */
export interface BaseEffect {
  effects?: Effect[] | undefined; // nested (success)
  else_effects?: Effect[] | undefined; // nested (failure)
  // Allow additional properties for extended interfaces
  [key: string]: any;
}

// =============================================================================
// COMBAT EFFECTS
// =============================================================================

/** Unified damage op - all variants use canonical fields */
export type DamageOps = Extract<EffectOp, "damage">;
export interface DamageEffect extends BaseEffect {
  op: DamageOps;
  amount?: number | string;
  target?: string;
  condition?: any;
  select?: number | string;
  distribution?: "direct" | "random_hits" | "split_sequential" | "by_stat";
  amount_source?:
    | "fixed"
    | "hand_size"
    | "selected_defense"
    | "golem_count"
    | "crest_count"
    | "other_allies";
  count?: number; // for random_hits
  stat?: "defense" | "hp"; // for by_stat
  spill_to_leader?: boolean; // for split_sequential
  include_leader?: boolean; // random_hits can target leader
  fallback_leader?: boolean; // if no followers, allow leader selection
}

/** Unified destroy op - handles all destruction via target/condition fields */
export type DestroyOps = Extract<EffectOp, "destroy">;
export interface DestroyEffect extends BaseEffect {
  op: DestroyOps;
  target?: string;
}

export type BanishOps = Extract<EffectOp, "banish">;
export interface BanishEffect extends BaseEffect {
  op: BanishOps;
  target?: string;
}

export type RestoreOps = Extract<EffectOp, "restore" | "heal_leader">;
export interface RestoreEffect extends BaseEffect {
  op: RestoreOps;
  amount?: number | string;
  target?: "leader" | "self" | "allies";
  amount_source?: "fixed" | "full" | "hand_size" | string;
  player?: "self" | "opponent";
  store_restored_as?: string;
}

// =============================================================================
// DEPRECATED: leader op is eliminated
// Leader effects now use:
// - stat op with target: ally:leader / enemy:leader (for defense/max HP)
// - keyword op with target: ally:leader / enemy:leader (for Barrier, MaxDamageCap, Vulnerable)
// =============================================================================
export type LeaderOps = Extract<EffectOp, "leader">; // = never

// =============================================================================
// RESOURCE EFFECTS
// =============================================================================

/** Unified PP/EP ops use action field for variants */
export type ResourceOps = Extract<
  EffectOp,
  "pp" | "ep" | "add_shadows" | "earth_rite" | "combo"
>;
export interface ResourceEffect extends BaseEffect {
  op: ResourceOps;
  amount?: number | string;
}

export type GateOps = Extract<EffectOp, "gate">;
export interface GateEffect extends BaseEffect {
  op: GateOps;
  condition?: string; // gate condition type
  cost?: number; // necromancy
  count?: number; // rally/hand/combo
  at_least?: number; // max_pp
  requirement?: number; // skybound_art
  name?: string; // board_name
}

/** Unified draw op - source field handles deck/named/copy variants */
export type DrawOps = Extract<EffectOp, "draw">;
export interface DrawEffect extends BaseEffect {
  op: DrawOps;
  count?: number;
  name?: string;
  keyword?: string;
}

/** Search op - filtered deck search with shuffle */
export type SearchOps = Extract<EffectOp, "search">;
export interface SearchEffect extends BaseEffect {
  op: SearchOps;
  count?: number;
  filter?: Record<string, any>;
  filters?: Record<string, any>;
}

/** add_to_hand op - add card to hand (token generation or copy) */
export type AddToHandOps = Extract<EffectOp, "add_to_hand">;
export interface AddToHandEffect extends BaseEffect {
  op: AddToHandOps;
  source?: "named" | "copy"; // default: "named"
  name?: string; // required when source=named
  target?: "selected" | "last_drawn" | "trigger" | "self"; // required when source=copy
  count: number;
  player?: "ally" | "enemy";
}

/** Unified discard op - mode field handles select/except_named variants */
export type HandOps = Extract<EffectOp, "discard">;
export interface HandEffect extends BaseEffect {
  op: HandOps;
  name?: string;
  count?: number;
}

/** Unified deck op - handles all deck manipulation via action field */
export type DeckOps = Extract<EffectOp, "deck">;
export interface DeckEffect extends BaseEffect {
  op: DeckOps;
}

/** Unified crest op */
export type CrestOps = Extract<EffectOp, "crest">;
export interface CrestEffect extends BaseEffect {
  op: CrestOps;
  action?: string; // gain, add_counter, pay_counter, advance_countdown, destroy
  name?: string;
  crest?: string;
  counter?: string;
  amount?: number;
  countdown?: number;
  triggers?: any[];
  on_success_effects?: any[];
}

// =============================================================================
// FUSE EFFECTS
// =============================================================================

export type FuseOps = Extract<EffectOp, "fuse">;
export interface FuseEffect extends BaseEffect {
  op: FuseOps;
  action?: "start" | "finalize";
  type?:
    | "generic"
    | "fortifier"
    | "alpha"
    | "gear_multi"
    | "loot"
    | "gardens_allure";
  initiator_uid?: string;
  partner?: any;
  result?: any;
  result_name?: string;
}

// =============================================================================
// BOARD EFFECTS
// =============================================================================

/** Unified summon - all variants handled via source/mode fields */
export type SummonOps = Extract<EffectOp, "summon">;
export interface SummonEffect extends BaseEffect {
  op: SummonOps;
  source?: "named" | "copy" | "deck" | "hand" | "graveyard";
  mode?: "copy" | "reanimate" | "chain_fill";
  name?: string;
  count?: number;
  target?: string;
  condition?: any;
  filter?: { type?: string; tribe?: string };
  select?: boolean;
  sort?: "cost_desc" | "random";
  eot_destroy?: boolean;
}

/** Unified return op */
export type ReturnOps = Extract<EffectOp, "return">;
export interface ReturnEffect extends BaseEffect {
  op: ReturnOps;
  destination?: string; // hand, deck
  target?: string;
  select?: number | "all";
  select_count?: number;
}

/** Unified amulet op - handles amulet countdown */
export type AmuletOps = Extract<EffectOp, "amulet">;
export interface AmuletEffect extends BaseEffect {
  op: AmuletOps;
  action?: string; // reduce_countdown, delay_countdown
  amount?: number;
}

export type TransformOps = Extract<EffectOp, "transform">;
export interface TransformEffect extends BaseEffect {
  op: TransformOps;
  name?: string;
}

// =============================================================================
// BUFF EFFECTS
// =============================================================================

/** Unified stat op */
export type BuffOps = Extract<EffectOp, "stat">;
export interface BuffEffect extends BaseEffect {
  op: BuffOps;
  action?: string; // give, set
  attack?: number | string;
  defense?: number | string;
  target?: string;
  condition?: any;
}

export type AttacksOps = Extract<EffectOp, "attacks_per_turn">;
export interface AttacksEffect extends BaseEffect {
  op: AttacksOps;
  amount?: number;
}

/** Unified keyword op */
export type KeywordOps = Extract<EffectOp, "keyword">;
export interface KeywordEffect extends BaseEffect {
  op: KeywordOps;
  action?: string; // grant, remove, silence, grant_trigger
  keywords?: (string | { name: string; [key: string]: any })[];
  trigger?: any;
  target?: string;
  condition?: any;
  select?: any;
  select_count?: number;
  filters?: { class?: string; type?: string; tribe?: string };
  exclude_self?: boolean;
  until_end_of_turn?: boolean;
}

/** Unified cost op */
export type CostOps = Extract<EffectOp, "cost">;
export interface CostEffect extends BaseEffect {
  op: CostOps;
  target?: string; // self, selected, pool, opponent_hand
  mode?: string; // reduce, set, modify, increase
  amount?: number | string;
  pool?: string; // for target: "pool"
  min_cost?: number;
  until_eot?: boolean;
}

/** Unified counter op */
export type CounterOps = Extract<EffectOp, "counter">;
export interface CounterEffect extends BaseEffect {
  op: CounterOps;
  action?: string; // add, reduce_countdown, delay_countdown
  key?: string; // for "add" action - e.g. "earth"
  amount?: number;
}

/** Unified spellboost op */
export type SpellboostOps = Extract<EffectOp, "spellboost">;
export interface SpellboostEffect extends BaseEffect {
  op: SpellboostOps;
  target?: string; // hand, self
  mode?: string; // boost, set
  count?: number | string;
}

/** Unified countdown op */
export type CountdownOps = Extract<EffectOp, "countdown">;
export interface CountdownEffect extends BaseEffect {
  op: CountdownOps;
  action?: "advance" | "delay";
  amount?: number;
  target?: "self" | string;
  name?: string; // crest name for name-based targeting
}

// =============================================================================
// MISC EFFECTS
// =============================================================================

export type MiscOps = Extract<
  EffectOp,
  | "select"
  | "target"
  | "mode"
  | "mode_bonus"
  | "nested_effects"
  | "repeat_effect"
  | "replicate"
  | "boost_skybound_art_hand"
>;
export interface MiscEffect extends BaseEffect {
  op: MiscOps;
  count?: number;
  target?: string;
  select?: any;
  options?: any[]; // for mode op
  select_count?: number;
  unique?: boolean;
  zone?: string; // replicate op
}

/** Unified evolve op (+ legacy self-evolve shims) */
export type EvolveOps = Extract<
  EffectOp,
  "evolve" | "evolve_self" | "super_evolve_self"
>;
export interface EvolveEffect extends BaseEffect {
  op: EvolveOps;
  name?: string;
}

export type SpecialOps = Extract<EffectOp, "set_deckout_victory">;
export interface SpecialEffect extends BaseEffect {
  op: SpecialOps;
}

// =============================================================================
// EFFECT TYPE MAPPING
// =============================================================================

/** Helper to enforce exact op matches in the mapped type */
type Exact<T, Op> = T extends { op: unknown } ? T & { op: Op } : never;

/** The Total Mapping - maps each Op to its interface */
type MappedOps = { [K in DamageOps]: Exact<DamageEffect, K> } & {
  [K in DestroyOps]: Exact<DestroyEffect, K>;
} & { [K in BanishOps]: Exact<BanishEffect, K> } & {
  [K in RestoreOps]: Exact<RestoreEffect, K>;
} & { [K in ResourceOps]: Exact<ResourceEffect, K> } & {
  // Note: LeaderOps = never (deprecated), so omitted from MappedOps
  [K in GateOps]: Exact<GateEffect, K>;
} & { [K in DrawOps]: Exact<DrawEffect, K> } & {
  [K in SearchOps]: Exact<SearchEffect, K>;
} & { [K in AddToHandOps]: Exact<AddToHandEffect, K> } & {
  [K in HandOps]: Exact<HandEffect, K>;
} & { [K in DeckOps]: Exact<DeckEffect, K> } & {
  [K in CrestOps]: Exact<CrestEffect, K>;
} & {
  [K in FuseOps]: Exact<FuseEffect, K>;
} & {
  [K in SummonOps]: Exact<SummonEffect, K>;
} & { [K in ReturnOps]: Exact<ReturnEffect, K> } & {
  [K in AmuletOps]: Exact<AmuletEffect, K>;
} & { [K in TransformOps]: Exact<TransformEffect, K> } & {
  [K in BuffOps]: Exact<BuffEffect, K>;
} & { [K in AttacksOps]: Exact<AttacksEffect, K> } & {
  [K in KeywordOps]: Exact<KeywordEffect, K>;
} & { [K in CostOps]: Exact<CostEffect, K> } & {
  [K in CounterOps]: Exact<CounterEffect, K>;
} & { [K in SpellboostOps]: Exact<SpellboostEffect, K> } & {
  [K in CountdownOps]: Exact<CountdownEffect, K>;
} & { [K in MiscOps]: Exact<MiscEffect, K> } & {
  [K in EvolveOps]: Exact<EvolveEffect, K>;
} & { [K in SpecialOps]: Exact<SpecialEffect, K> };

export type EffectByOp = MappedOps;

// Type assertions - validate type system integrity
type _AssertTotal = EffectOp extends keyof EffectByOp ? true : never;
type _AssertReverse = keyof EffectByOp extends EffectOp ? true : never;

// Force evaluation - compile error if any assertion fails
const _checks: [_AssertTotal, _AssertReverse] = [true, true];

/** The Union Type - all possible effects */
export type Effect = EffectByOp[keyof EffectByOp];

export type EffectResult = "pending" | void;

// =============================================================================
// EFFECT EXECUTION TYPES
// =============================================================================

/** Type alias for the effect execution queue */
export type EffectQueue = Effect[];

/**
 * Condition object used for filtering targets or gating effects.
 * All fields are optional - an empty condition matches everything.
 */
export interface EffectCondition {
  type?: "Follower" | "Amulet" | "Spell" | string;
  tribe?: string;
  tribes?: string[];
  class?: string;
  cost?: number | { op: "lt" | "lte" | "gt" | "gte" | "eq"; value: number };
  cost_lte?: number;
  cost_gte?: number;
  keyword?: string;
  has_keyword?: string | string[];
  has_evolved?: boolean;
  is_damaged?: boolean;
  name?: string;
  name_in?: string[];
  exclude_self?: boolean;
}

/**
 * Context object passed through effect execution chain.
 *
 * UID-based fields (targetUids, etc.) are preferred for determinism.
 */
export interface EffectContext {
  // UID-based targeting (preferred for determinism)
  targetUids?: string[];
  enteringCardUid?: string;
  attackerUid?: string;
  defenderUid?: string;

  // Object refs (deprecated - use UIDs instead)
  /** @deprecated Use targetUids */
  targets?: CardInstance[];
  /** @deprecated Use enteringCardUid */
  enteringCard?: CardInstance;
  /** @deprecated Use defenderUid */
  defender?: CardInstance;
  /** @deprecated Use attackerUid */
  attacker?: CardInstance;

  /** Flag indicating this effect requires targeting */
  isTargetedEffect?: boolean;
  /** Number of targets to select */
  selectCount?: number;
  /** Cross-effect communication variables */
  variables?: Record<string, number | string>;
  /** Adapter reference for rendering */
  adapter?: { render: () => void };
  /** Injected runEffects function for nested execution */
  runner?: (
    effects: Effect[],
    owner: Player,
    sourceCard: CardInstance | null,
    ctx?: EffectContext,
  ) => EffectResult;
}
