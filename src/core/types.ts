import { KeywordState } from "../logic/core/keywords/types.js";
import { PlayedHistoryEntry } from "../logic/core/playCard/types.js";
import { EffectOp } from "../logic/core/effects/opTypes.js";

export type Player = "blue" | "red";

export { EffectOp };

// Common fields for all effects
export interface BaseEffect {
    effects?: Effect[] | undefined; // nested (success)
    else_effects?: Effect[] | undefined; // nested (failure)
    [key: string]: any; // Allow other properties but op MUST be strict in specific interfaces
}

// --- Combat ---
export type DamageOps = Extract<EffectOp, "damage" | "damage_all" | "damage_random" | "damage_split_sequential" | "damage_follower_or_leader" | "damage_all_by_allied_golems" | "damage_split_fixed" | "damage_random_selected_defense" | "damage_split_all_enemies" | "damage_highest_defense" | "damage_enemy_leader_by_other_allies" | "damage_self">;
export interface DamageEffect extends BaseEffect {
    op: DamageOps;
    amount?: number | string;
    add_amount?: number | string;
    target?: string;
    condition?: any;
    select?: number | string;
    can_target_leader?: boolean;
    count_source?: string;
}

export type DestroyOps = Extract<EffectOp, "destroy" | "destroy_all" | "destroy_highest" | "destroy_random" | "destroy_random_other_allies" | "destroy_allied_amulets" | "destroy_allied_amulets_then_damage" | "destroy_self" | "destroy_then" | "destroy_defender_if_damaged" | "follower_strike_destroy" | "clash_damage">;
export interface DestroyEffect extends BaseEffect {
    op: DestroyOps;
    target?: string;
}

export type BanishOps = Extract<EffectOp, "banish" | "banish_all_enemy_copies" | "banish_duplicates_from_deck" | "banish_random" | "banish_self">;
export interface BanishEffect extends BaseEffect {
    op: BanishOps;
    target?: string;
}

export type HealOps = Extract<EffectOp, "heal_leader" | "dynamic_heal_leader" | "set_max_hp" | "leader_barrier" | "restore_full_defense_self" | "restore_self_and_heal_leader" | "restore_allies" | "modify_leader_damage_received" | "add_leader_damage_taken_bonus" | "set_leader_max_damage_cap">;
export interface HealEffect extends BaseEffect {
    op: HealOps;
    amount?: number | string;
}

// --- Resources ---
export type ResourceOps = Extract<EffectOp, "add_max_pp" | "gain_max_pp" | "recover_pp" | "recover_ep" | "add_shadows" | "earth_rite">;
export interface ResourceEffect extends BaseEffect {
    op: ResourceOps;
    amount?: number | string;
}

export type GateOps = Extract<EffectOp, "necromancy_gate" | "overflow_gate" | "hand_count_gate" | "rally_gate" | "amulet_count_gate" | "board_name_gate" | "both_max_pp_gate" | "combo_gate" | "evolved_self_gate" | "super_evolve_gate" | "super_evolved_self_gate" | "evolved_allied_gate" | "super_evolved_allied_gate" | "max_pp_gate" | "no_ally_attacked_this_turn_gate" | "no_duplicates_in_deck_gate" | "skybound_art_gate" | "self_cost_gate">;
export interface GateEffect extends BaseEffect {
    op: GateOps;
    cost?: number; // necromancy
    count?: number; // rally/hand
    name?: string; // board_name
}

export type DrawOps = Extract<EffectOp, "draw" | "draw_all_named_with_keyword" | "draw_combo_follower" | "draw_filtered" | "draw_named" | "draw_opponent">;
export interface DrawEffect extends BaseEffect {
    op: DrawOps;
    count?: number;
    name?: string;
    keyword?: string;
}

export type HandOps = Extract<EffectOp, "add_to_hand" | "add_selected_copy_to_hand" | "discard_select_hand" | "discard_all_except_named" | "transform_in_hand" | "transform_random_spell_in_hand">;
export interface HandEffect extends BaseEffect {
    op: HandOps;
    name?: string;
    count?: number;
}

export type DeckOps = Extract<EffectOp, "replace_deck" | "replace_deck_with_set_minus" | "set_cost_last_drawn" | "halve_deck_cost" | "reduce_deck_followers_cost">;
export interface DeckEffect extends BaseEffect {
    op: DeckOps;
}

export type CrestOps = Extract<EffectOp, "gain_crest" | "crest_add_counter" | "crest_pay_counter" | "crest_advance_countdown" | "destroy_crest">;
export interface CrestEffect extends BaseEffect {
    op: CrestOps;
    name?: string;
    crest?: string;
    counter?: string;
    amount?: number;
}

export type FuseOps = Extract<EffectOp, "fuse_start" | "start_fortifier_fuse" | "start_fuse_from_card" | "fuse_finalize_fortifier" | "fuse_finalize_generic" | "fuse_finalize_alpha" | "fuse_finalize_gear_multi" | "fuse_finalize_gardens_allure" | "fuse_finalize_loot">;
export interface FuseEffect extends BaseEffect {
    op: FuseOps;
    initiator_uid?: string;
    partner?: any;
    result?: any;
}

// --- Board ---
export type SummonOps = Extract<EffectOp, "summon" | "summon_named" | "summon_exact_copy" | "summon_named_enemy" | "summon_random_from_deck" | "summon_destroyed_amulet_highest_base_cost" | "select_hand_summon_artifact_copy" | "select_hand_summon_artifact_copies_eot_destroy">;
export interface SummonEffect extends BaseEffect {
    op: SummonOps;
    name?: string;
    count?: number;
    target?: string;
    condition?: any;
}

export type CongregantOps = Extract<EffectOp, "fill_congregant_copies" | "congregant_fill_board" | "fill_board_chain_decay">;
export interface CongregantEffect extends BaseEffect {
    op: CongregantOps;
}

export type ReanimateOps = Extract<EffectOp, "reanimate">;
export interface ReanimateEffect extends BaseEffect {
    op: ReanimateOps;
    cost?: number;
}

export type ReturnOps = Extract<EffectOp, "return_to_hand" | "bounce" | "return_hand_to_deck">;
export interface ReturnEffect extends BaseEffect {
    op: ReturnOps;
}

export type TransformOps = Extract<EffectOp, "transform">;
export interface TransformEffect extends BaseEffect {
    op: TransformOps;
    name?: string;
}

// --- Buffs ---
export type BuffOps = Extract<EffectOp, "buff" | "buff_hand_class" | "buff_hand_tribe" | "buff_last_added_to_hand" | "buff_self" | "dynamic_buff_self" | "combo_repeat_buff" | "set_stats" | "set_attack_to">;
export interface BuffEffect extends BaseEffect {
    op: BuffOps;
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

export type KeywordOps = Extract<EffectOp, "keyword" | "remove_keyword" | "remove_abilities" | "grant_trigger">;
export interface KeywordEffect extends BaseEffect {
    op: KeywordOps;
    keyword?: string;
    target?: string;
    condition?: any;
    select?: any;
    select_count?: number;
}

export type CostOps = Extract<EffectOp, "modify_cost" | "modify_cost_pool" | "reduce_cost" | "reduce_cost_self" | "set_cost_self" | "increase_opponent_hand_cost_eot">;
export interface CostEffect extends BaseEffect {
    op: CostOps;
    amount?: number | string;
}

export type CounterOps = Extract<EffectOp, "add_counter" | "reduce_countdown" | "increase_countdown">;
export interface CounterEffect extends BaseEffect {
    op: CounterOps;
    amount?: number;
    name?: string; // e.g. "loot_counter"
}

export type SpellboostOps = Extract<EffectOp, "spellboost" | "spellboost_hand" | "spellboost_target" | "set_spellboost_count" | "transform_self_if_spellboost_at_least">;
export interface SpellboostEffect extends BaseEffect {
    op: SpellboostOps;
    amount?: number;
}

// --- Misc ---
export type MiscOps = Extract<EffectOp, "select" | "target" | "choose" | "choose_bonus_add" | "nested_effects" | "repeat_effect" | "boost_skybound_art_hand">;
export interface MiscEffect extends BaseEffect {
    op: MiscOps;
    count?: number;
    target?: string;
    select?: any;
}

export type EvolveOps = Extract<EffectOp, "evolve" | "evolve_self" | "super_evolve_self" | "evolve_last_summoned" | "evolve_all_unevolved_allies" | "evolve_all_allies_named" | "super_evolve_all_unevolved_allies" | "super_evolve_ally" | "super_evolve">;
export interface EvolveEffect extends BaseEffect {
    op: EvolveOps;
    name?: string;
}

export type SpecialOps = Extract<EffectOp, "set_deckout_victory" | "dragonsign" | "combo_add">;
export interface SpecialEffect extends BaseEffect {
    op: SpecialOps;
}

// Helper to enforce exact op matches in the mapped type
type Exact<T, Op> = T extends { op: unknown } ? (T & { op: Op }) : never;

// --- The Total Mapping ---
// we map each Group of Ops to their interface, but narrowed to the specific Op
type MappedOps =
    & { [K in DamageOps]: Exact<DamageEffect, K> }
    & { [K in DestroyOps]: Exact<DestroyEffect, K> }
    & { [K in BanishOps]: Exact<BanishEffect, K> }
    & { [K in HealOps]: Exact<HealEffect, K> }
    & { [K in ResourceOps]: Exact<ResourceEffect, K> }
    & { [K in GateOps]: Exact<GateEffect, K> }
    & { [K in DrawOps]: Exact<DrawEffect, K> }
    & { [K in HandOps]: Exact<HandEffect, K> }
    & { [K in DeckOps]: Exact<DeckEffect, K> }
    & { [K in CrestOps]: Exact<CrestEffect, K> }
    & { [K in FuseOps]: Exact<FuseEffect, K> }
    & { [K in SummonOps]: Exact<SummonEffect, K> }
    & { [K in CongregantOps]: Exact<CongregantEffect, K> }
    & { [K in ReanimateOps]: Exact<ReanimateEffect, K> }
    & { [K in ReturnOps]: Exact<ReturnEffect, K> }
    & { [K in TransformOps]: Exact<TransformEffect, K> }
    & { [K in BuffOps]: Exact<BuffEffect, K> }
    & { [K in AttacksOps]: Exact<AttacksEffect, K> }
    & { [K in KeywordOps]: Exact<KeywordEffect, K> }
    & { [K in CostOps]: Exact<CostEffect, K> }
    & { [K in CounterOps]: Exact<CounterEffect, K> }
    & { [K in SpellboostOps]: Exact<SpellboostEffect, K> }
    & { [K in MiscOps]: Exact<MiscEffect, K> }
    & { [K in EvolveOps]: Exact<EvolveEffect, K> }
    & { [K in SpecialOps]: Exact<SpecialEffect, K> };

export type EffectByOp = MappedOps;

// Assertions
// 1. Total: All EffectOp keys must be present in EffectByOp
type _AssertTotal = EffectOp extends keyof EffectByOp ? true : never;

// 2. Exact: EffectByOp[K].op must be exactly K (Bi-directional)
type _AssertExact = {
    [K in EffectOp]:
    EffectByOp[K]["op"] extends K
    ? (K extends EffectByOp[K]["op"] ? true : never)
    : never;
};
// Collapse the mapped type — if any entry is `never`, this becomes `never`
type _AssertExactAll = _AssertExact[EffectOp] extends true ? true : never;

// 3. Reverse: EffectByOp keys must be exactly EffectOp
type _AssertReverse = keyof EffectByOp extends EffectOp ? true : never;

// Force evaluation
const _checks: [_AssertTotal, _AssertReverse, _AssertExactAll] = [true, true, true];

// The Union Type
export type Effect = EffectByOp[keyof EffectByOp];

export type EffectResult = "pending" | void;

// --- Other Interfaces from original file ---

export interface KeywordEntry {
    name: string;
    cost?: number;
    effects?: Effect[];
    key?: string;
    count?: number;
    reduceCostBy?: number;
    minCost?: number;
    destroyOnEmpty?: boolean;
    turns?: string | number; // for countdown
    [key: string]: any;
}

export interface CardTemplate {
    id: string; // Unique Identifier (e.g. "10001110")
    uid: string;
    name: string;
    type: "Follower" | "Amulet" | "Spell" | string;
    class?: string;
    tribes?: string[];
    description?: string;
    base_image?: string;
    image?: string;
    evo_image?: string;
    cost: number | string;
    base_cost?: number | string;
    // Stats
    attack?: number | string;
    defense?: number | string;
    base_attack?: number | string;
    base_defense?: number | string;
    // Flags
    can_attack?: boolean;
    hasAttacked?: boolean;
    justPlayed?: boolean;
    hasRush?: boolean;
    isRush?: boolean;
    hasWard?: boolean;
    hasIntimidate?: boolean;
    hasBane?: boolean;
    hasLastWords?: boolean;
    hasEvolved?: boolean;
    hasCountdown?: boolean;
    hasEngage?: boolean;
    hasStorm?: boolean;
    cant_play?: boolean;
    // Spell/Amulet specific
    spell?: Effect[];
    fuse?: any[];
    fuse_recipes?: any[];
    // Combat / Runtime
    attacks_left?: number;
    attacks_per_turn?: number;
    attacks_used_this_turn?: number;
    triggers?: any[];
    // Runtime-like (template might not have them but they appear)
    cost_mod?: number;
    effectiveCost?: number;
    potential_attack?: number;
    potential_defense?: number;
    countdown?: number | string;
    peak_defense?: number;
    counters?: Record<string, number>;
    keywords?: (string | KeywordEntry)[];
    fanfare?: Effect[];
    enhanceTiers?: { cost: number; effects?: Effect[] }[];
    evoType?: "normal" | "super";
    evolve?: Effect[] | { effects: Effect[] };
    superevolve?: Effect[] | { effects: Effect[] };
    evolve_trigger_always?: boolean;
    lastWordsEffects?: Effect[];
    // Buff tracking
    buffs?: {
        attack?: number | undefined;
        defense?: number | undefined;
        [key: string]: any;
    } | undefined;
    [key: string]: any;
}

export interface CardInstance extends CardTemplate {
    owner?: Player;
    zone?: "deck" | "hand" | "board" | "graveyard" | "banished";
    instanceId?: string | number;
    originalCost?: number;
    // Runtime counters
    spellboostCount?: number;
    keywordState?: KeywordState;
    // UI
    __uiFlashBarrier?: boolean;
    __uiPopBarrier?: boolean;
    __uiSelectable?: boolean;
    __mulliganSelectable?: boolean;
    __mulliganSelected?: boolean;
    __icarusBuff?: boolean;
    _spawnedByChain?: boolean;
    _spawnedByCongregant?: boolean;
    isDamaged?: boolean;
    shownCost?: number; // UI preview cost

    // Fuse
    _fusedLootNames?: string[];
    __lootFuseTurn?: number;
    __lootFuseCount?: number;
    lastFuseRound?: number;
    isFused?: boolean;

    // Legacy / loose props (migrating slowly)
    on_discard?: Effect[];
}

import { RNG } from "./rng.js";

export interface GameState {
    rng: RNG;
    blueHP: number;
    redHP: number;
    bluePP: number;
    redPP: number;
    blueMaxPP: number;
    redMaxPP: number;
    bluePermPP: number;
    redPermPP: number;
    roundCount: number;
    isBlueTurn: boolean;
    gameStarted: boolean;
    blueHand: CardInstance[];
    redHand: CardInstance[];
    blueBoard: CardInstance[];
    redBoard: CardInstance[];
    blueDeck: CardInstance[];
    redDeck: CardInstance[];
    blueGraveyard: CardInstance[];
    redGraveyard: CardInstance[];
    bluePlayedHistory: PlayedHistoryEntry[];
    redPlayedHistory: PlayedHistoryEntry[];
    blueDestroyedHistory: CardInstance[];
    redDestroyedHistory: CardInstance[];
    blueCrests: any[];
    redCrests: any[];
    blueShadows: number;
    redShadows: number;
    blueRally: number;
    redRally: number;
    blueEvoCharges: number;
    redEvoCharges: number;
    blueSuperEvoCharges: number;
    redSuperEvoCharges: number;
    blueEvoUsedThisTurn: boolean;
    redEvoUsedThisTurn: boolean;
    // Total total successful evolves per match (for counting, e.g. Odin/Grimnir/Sandalphon gates)
    blueEvoCount: number;
    redEvoCount: number;
    bluePlaysThisTurn: number;
    redPlaysThisTurn: number;
    blueChooseBonus: number;
    redChooseBonus: number;
    blueAnyAllyAttackedThisTurn?: boolean;
    redAnyAllyAttackedThisTurn?: boolean;
    pendingTargetEffect?: {
        eff: Effect;
        owner: Player;
        sourceCard: CardInstance | null;
        resumeEffects: Effect[];
        pool: CardInstance[];
        targets: CardInstance[];
        selectCount: number;
        canTargetLeader?: boolean | undefined;
        requiresConfirmation?: boolean | undefined;
        confirmationText?: string | undefined;
    } | undefined;
    lastSummoned: CardInstance[];
    lastDrawnCards: CardInstance[];
    lastFuse?: { result_name: string;[key: string]: any } | undefined;
    deckoutWinsBlue?: boolean | undefined;
    deckoutWinsRed?: boolean | undefined;
    blueLeaderBarrier?: number | undefined;
    redLeaderBarrier?: number | undefined;
    [key: string]: any;
}

export interface StartGameOptions {
    deckAId: string;
    deckBId: string;
    seed?: number | undefined;
}

// Action Payloads
export type TargetSpec =
    | { type: "card"; uid: string }
    | { type: "leader"; player: Player };

export type PlayCardAction = {
    type: "PLAY_CARD";
    player: Player;
    cardUid: string;
};

export type AttackAction = {
    type: "ATTACK";
    player: Player;
    attackerUid: string;
    defender: TargetSpec;
};

export interface ChooseTargetAction {
    type: "CHOOSE_TARGET";
    player: Player;
    target: TargetSpec;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION TYPE MAPPING - Closed-world union with type-level assertions
// ─────────────────────────────────────────────────────────────────────────────

// Step 1: Define all action types as string literal union
export type ActionType =
    | "UNDO"
    | "REDO"
    | "RESET_HISTORY"
    | "END_TURN"
    | "PLAY_CARD"
    | "ATTACK"
    | "CHOOSE_TARGET";

// Step 2: Define the canonical type mapping (ActionType -> Action interface)
export interface ActionByType {
    UNDO: { type: "UNDO" };
    REDO: { type: "REDO" };
    RESET_HISTORY: { type: "RESET_HISTORY" };
    END_TURN: { type: "END_TURN" };
    PLAY_CARD: PlayCardAction;
    ATTACK: AttackAction;
    CHOOSE_TARGET: ChooseTargetAction;
}

// Step 3: Type assertions to enforce totality and exactness
// Total: All ActionType keys must be present in ActionByType
type _AssertActionTotal = ActionType extends keyof ActionByType ? true : never;
// Reverse: ActionByType keys must be exactly ActionType
type _AssertActionReverse = keyof ActionByType extends ActionType ? true : never;
// Exact: ActionByType[K].type must equal K for all K
type _AssertActionExact = {
    [K in ActionType]: ActionByType[K]["type"] extends K
    ? (K extends ActionByType[K]["type"] ? true : never)
    : never;
};
type _AssertActionExactAll = _AssertActionExact[ActionType] extends true ? true : never;

// Force evaluation
const _actionChecks: [_AssertActionTotal, _AssertActionReverse, _AssertActionExactAll] = [true, true, true];

// Step 4: The Union Type (derived from mapping)
export type PlayerAction = ActionByType[ActionType];

// Legacy aliases for compatibility
export type HistoryAction = ActionByType["UNDO"] | ActionByType["REDO"] | ActionByType["RESET_HISTORY"];
export type GameAction = ActionByType["END_TURN"];
