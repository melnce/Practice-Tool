import { KeywordState } from "../logic/core/keywords/types.js";
import { PlayedHistoryEntry } from "../logic/core/playCard/types.js";
import { EffectOp } from "../logic/core/effects/opTypes.js";

// =============================================================================
// PLAYER TYPES
// =============================================================================

/**
 * Semantic player slot based on turn order.
 * - "first": Player who takes turn 1 (no PP boost, draws 3 cards)
 * - "second": Player who takes turn 2 (has PP boost, draws 3+1 cards)
 */
export type PlayerSlot = "first" | "second";

/**
 * Legacy player identifier - DEPRECATED.
 * Only used for UI display purposes via SLOT_TO_LEGACY.
 * @deprecated Use PlayerSlot for all game logic
 */
export type LegacyPlayer = "blue" | "red";

/**
 * Player type - NOW USES PlayerSlot ONLY
 * 
 * All game logic uses "first" / "second" semantic slots.
 * Use SLOT_TO_LEGACY for UI display purposes only.
 */
export type Player = PlayerSlot;

/**
 * Maps semantic slots to legacy display names.
 * Use ONLY for UI display purposes (labels, CSS classes, etc).
 */
export const SLOT_TO_LEGACY: Record<PlayerSlot, LegacyPlayer> = {
    first: "blue",
    second: "red",
};

// =============================================================================
// PLAYER STATE (Normalized per-player data)
// =============================================================================

/**
 * Complete state for one player.
 * All per-player data is consolidated here for:
 * - Clean state structure
 * - Easy AI/RL observation
 * - Perspective-agnostic logic
 */
export interface PlayerState {
    // === Resources ===
    hp: number;
    maxHP: number;
    pp: number;
    maxPP: number;
    permPP: number; // Permanent PP bonus (e.g., from Zooey)

    // === Zones ===
    hand: CardInstance[];
    deck: CardInstance[];
    board: CardInstance[];
    graveyard: CardInstance[];

    // === Counters ===
    shadows: number;
    rally: number;
    evoCharges: number;
    superEvoCharges: number;
    modeBonus: number;

    // === Evolution ===
    evoUsedThisTurn: boolean;
    evoCount: number; // Total successful evolves this match

    // === Per-Turn State ===
    playsThisTurn: number;
    anyAllyAttackedThisTurn: boolean;
    shikigamiDeathsThisTurn: CardInstance[]; // For Kuon effect

    // === Boost (second player only) ===
    hasBoost: boolean; // True for second player
    boostPending: boolean;
    boostUsedEarly: boolean;
    boostUsedLate: boolean;

    // === History (for RL/analysis) ===
    playedHistory: PlayedHistoryEntry[];
    destroyedHistory: CardInstance[];

    // === Crests ===
    crests: import("../logic/effects/crest.js").Crest[];

    // === Leader State ===
    leaderBarrier: number;
    leaderDamageTakenBonus: number; // Beelzebub effect
    leaderMaxDamageCap: number | null; // Zooey effect (null = no cap)

    // === RL Metrics (accumulated during game) ===
    totalDamageDealt: number;
    totalDamageTaken: number;
    totalCardsPlayed: number;
    totalCardsDrawn: number;
    followersDestroyed: number; // Enemy followers this player killed
    deckoutWins: boolean; // If true, this player wins on deckout

    // === Deck Metadata ===
    deckFile?: string; // Original deck file path
}

/**
 * Create a fresh PlayerState with default values.
 * @param isSecond - True if this is the second player (gets PP boost)
 */
export function createPlayerState(isSecond: boolean = false): PlayerState {
    return {
        // Resources
        hp: 20,
        maxHP: 20,
        pp: 0,
        maxPP: 0,
        permPP: 0,

        // Zones
        hand: [],
        deck: [],
        board: [],
        graveyard: [],

        // Counters
        shadows: 0,
        rally: 0,
        evoCharges: 0,
        superEvoCharges: 0,
        modeBonus: 0,

        // Evolution
        evoUsedThisTurn: false,
        evoCount: 0,

        // Per-Turn
        playsThisTurn: 0,
        anyAllyAttackedThisTurn: false,
        shikigamiDeathsThisTurn: [],

        // Boost - only second player has it
        hasBoost: isSecond,
        boostPending: false,
        boostUsedEarly: false,
        boostUsedLate: false,

        // History
        playedHistory: [],
        destroyedHistory: [],

        // Crests
        crests: [],

        // Leader State
        leaderBarrier: 0,
        leaderDamageTakenBonus: 0,
        leaderMaxDamageCap: null,

        // RL Metrics
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        totalCardsPlayed: 0,
        totalCardsDrawn: 0,
        followersDestroyed: 0,
        deckoutWins: false,
    };
}

export { EffectOp };

// Common fields for all effects
// Note: Index signature allows extended interfaces to add their own fields
// Type safety is enforced at the handler level via EffectContext
export interface BaseEffect {
    effects?: Effect[] | undefined; // nested (success)
    else_effects?: Effect[] | undefined; // nested (failure)
    // Allow additional properties for extended interfaces
    [key: string]: any;
}

// --- Combat ---
// Unified damage op - all variants use canonical fields: distribution, amount_source, etc.
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

// Unified destroy op - handles all destruction via target/condition fields
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

export type RestoreOps = Extract<EffectOp, "restore">;
export interface RestoreEffect extends BaseEffect {
    op: RestoreOps;
    amount?: number | string;
    target?: "leader" | "self" | "allies";
    amount_source?: "fixed" | "full" | "hand_size" | string;
    player?: "self" | "opponent";
    store_restored_as?: string;
}

// ========================================================================
// DEPRECATED: leader op is eliminated
// Leader effects now use:
// - stat op with target: ally:leader / enemy:leader (for defense/max HP)
// - keyword op with target: ally:leader / enemy:leader (for Barrier, MaxDamageCap, Vulnerable)
// ========================================================================
// LeaderOps type is kept for backwards compatibility but should be never
export type LeaderOps = Extract<EffectOp, "leader">; // = never

// --- Resources ---
// Unified PP/EP ops use action field for variants
// add_shadows and earth_rite are still distinct ops in registry
export type ResourceOps = Extract<
    EffectOp,
    "pp" | "ep" | "add_shadows" | "earth_rite"
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

// Unified draw op - source field handles deck/named/copy variants
export type DrawOps = Extract<EffectOp, "draw">;
export interface DrawEffect extends BaseEffect {
    op: DrawOps;
    count?: number;
    name?: string;
    keyword?: string;
}

// Unified discard op - mode field handles select/except_named variants
// Legacy hand ops are now handled by draw (source: "named") or unified discard
export type HandOps = Extract<EffectOp, "discard">;
export interface HandEffect extends BaseEffect {
    op: HandOps;
    name?: string;
    count?: number;
}

// Unified deck op - handles all deck manipulation via action field
export type DeckOps = Extract<EffectOp, "deck">;
export interface DeckEffect extends BaseEffect {
    op: DeckOps;
}

// Unified crest op - replaces gain_crest, crest_add_counter, crest_pay_counter, destroy_crest, crest_advance_countdown
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

// --- Fuse (Unified) ---
export type FuseOps = Extract<EffectOp, "fuse">; // start_fortifier_fuse is now handled by fuse with type: "fortifier"
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

// --- Board ---
// Unified summon - all variants handled via source/mode fields
export type SummonOps = Extract<EffectOp, "summon">;
export interface SummonEffect extends BaseEffect {
    op: SummonOps;
    // Primitive fields for composable summon
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

// ========================================================================
// DEPRECATED: CongregantOps and ReanimateOps are now handled by unified summon
// summon op with mode: "chain_fill" or mode: "reanimate" replaces these
// ========================================================================
// Types removed - see SummonEffect for the unified interface

// Unified return op - replaces return_to_hand, bounce, return_hand_to_deck
export type ReturnOps = Extract<EffectOp, "return">;
export interface ReturnEffect extends BaseEffect {
    op: ReturnOps;
    destination?: string; // hand, deck
    target?: string;
    select?: number | "all";
    select_count?: number;
}

// Unified amulet op - handles amulet countdown (instance-based targeting)
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

// --- Stats (buffs) ---
// Unified stat op - mode: "combo_repeat" handles the legacy combo_repeat_buff
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

// Unified keyword op - replaces keyword, remove_keyword, remove_abilities, grant_trigger
export type KeywordOps = Extract<EffectOp, "keyword">;
export interface KeywordEffect extends BaseEffect {
    op: KeywordOps;
    action?: string; // grant, remove, silence, grant_trigger
    keywords?: (string | { name: string;[key: string]: any })[];
    trigger?: any;
    target?: string;
    condition?: any;
    select?: any;
    select_count?: number;
    filters?: { class?: string; type?: string; tribe?: string };
    exclude_self?: boolean;
    until_end_of_turn?: boolean;
}

// Unified cost op - replaces 6 legacy cost ops
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

// Unified counter op - replaces add_counter, reduce_countdown, delay_countdown
export type CounterOps = Extract<EffectOp, "counter">;
export interface CounterEffect extends BaseEffect {
    op: CounterOps;
    action?: string; // add, reduce_countdown, delay_countdown
    key?: string; // for "add" action - e.g. "earth"
    amount?: number;
}

// Unified spellboost op - handles boost and transform via mode field
// spellboost_transform is now gate + transform(zone: "self")
export type SpellboostOps = Extract<EffectOp, "spellboost">;
export interface SpellboostEffect extends BaseEffect {
    op: SpellboostOps;
    target?: string; // hand, self
    mode?: string; // boost, set
    count?: number | string;
}

// Unified countdown op - handles amulet and crest countdown timers
export type CountdownOps = Extract<EffectOp, "countdown">;
export interface CountdownEffect extends BaseEffect {
    op: CountdownOps;
    action?: "advance" | "delay";
    amount?: number;
    target?: "self" | string;
    name?: string; // crest name for name-based targeting
}

// --- Misc ---
// Note: gate has GateOps, evolve has EvolveOps, combo_add/set_deckout_victory have SpecialOps
export type MiscOps = Extract<
    EffectOp,
    | "select"
    | "target"
    | "mode"
    | "mode_bonus"
    | "nested_effects"
    | "repeat_effect"
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
}

// Unified evolve op - replaces 8 legacy evolve ops
export type EvolveOps = Extract<EffectOp, "evolve">;
export interface EvolveEffect extends BaseEffect {
    op: EvolveOps;
    name?: string;
}

// combo_add is now handled by counter with key: "combo"
export type SpecialOps = Extract<EffectOp, "set_deckout_victory">;
export interface SpecialEffect extends BaseEffect {
    op: SpecialOps;
}

// Helper to enforce exact op matches in the mapped type
type Exact<T, Op> = T extends { op: unknown } ? T & { op: Op } : never;

// --- The Total Mapping ---
// we map each Group of Ops to their interface, but narrowed to the specific Op
type MappedOps = { [K in DamageOps]: Exact<DamageEffect, K> } & {
    [K in DestroyOps]: Exact<DestroyEffect, K>;
} & { [K in BanishOps]: Exact<BanishEffect, K> } & {
    [K in RestoreOps]: Exact<RestoreEffect, K>;
} & // Note: LeaderOps = never (deprecated), so omitted from MappedOps
{ [K in ResourceOps]: Exact<ResourceEffect, K> } & {
    [K in GateOps]: Exact<GateEffect, K>;
} & { [K in DrawOps]: Exact<DrawEffect, K> } & {
    [K in HandOps]: Exact<HandEffect, K>;
} & { [K in DeckOps]: Exact<DeckEffect, K> } & {
    [K in CrestOps]: Exact<CrestEffect, K>;
} & { [K in FuseOps]: Exact<FuseEffect, K> } & {
    [K in SummonOps]: Exact<SummonEffect, K>;
} & // Note: CongregantOps and ReanimateOps removed - now unified in summon op
{ [K in ReturnOps]: Exact<ReturnEffect, K> } & {
    [K in AmuletOps]: Exact<AmuletEffect, K>;
} & { [K in TransformOps]: Exact<TransformEffect, K> } & {
    [K in BuffOps]: Exact<BuffEffect, K>;
} & { [K in AttacksOps]: Exact<AttacksEffect, K> } & {
    [K in KeywordOps]: Exact<KeywordEffect, K>;
} & { [K in CostOps]: Exact<CostEffect, K> } & {
} & { [K in CounterOps]: Exact<CounterEffect, K> } & {
    [K in SpellboostOps]: Exact<SpellboostEffect, K>;
} & { [K in CountdownOps]: Exact<CountdownEffect, K> } & {
    [K in MiscOps]: Exact<MiscEffect, K>;
} & { [K in EvolveOps]: Exact<EvolveEffect, K> } & {
    [K in SpecialOps]: Exact<SpecialEffect, K>;
};

export type EffectByOp = MappedOps;

// Assertions - validate type system integrity
// 1. Total: All EffectOp keys must be present in EffectByOp
type _AssertTotal = EffectOp extends keyof EffectByOp ? true : never;

// 2. Reverse: EffectByOp keys must be exactly EffectOp
type _AssertReverse = keyof EffectByOp extends EffectOp ? true : never;

// Force evaluation - compile error if any assertion fails
const _checks: [_AssertTotal, _AssertReverse] = [true, true];

// The Union Type
export type Effect = EffectByOp[keyof EffectByOp];

export type EffectResult = "pending" | void;

// =============================================================================
// EFFECT EXECUTION TYPES
// =============================================================================

/**
 * Type alias for the effect execution queue.
 * Use this instead of `any[]` or `Effect[]` for queue parameters.
 */
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
 * Replaces `context: any` throughout the codebase.
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
    buffs?:
    | {
        attack?: number | undefined;
        defense?: number | undefined;
        [key: string]: any;
    }
    | undefined;
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

    // === PLAYER DATA (nested) ===
    players: {
        first: PlayerState;
        second: PlayerState;
    };

    // === GLOBAL GAME STATE ===
    roundCount: number;
    /** Active player slot - sole source of truth for whose turn it is */
    activePlayer: PlayerSlot;
    gameStarted: boolean;

    // === SECOND PLAYER PP BOOST ===
    secondPlayerPPBoostUsedEarly: boolean;
    secondPlayerPPBoostUsedLate: boolean;
    secondPlayerPPBoostPending: boolean;

    // === MULLIGAN STATE ===
    phase?: "mulligan" | "playing" | "main" | undefined;
    mulliganStage?: "first" | "second" | "done" | undefined;
    mulliganFirstSelected?: Set<string>;
    mulliganSecondSelected?: Set<string>;

    // === EPHEMERAL STATE ===
    pendingTargetEffect?:
    | {
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
        // UID-based fields (preferred for serialization)
        sourceCardUid?: string;
        poolUids?: string[];
        targetUids?: string[];
    }
    | undefined;
    lastSummoned: CardInstance[];
    lastDrawnCards: CardInstance[];
    lastFuse?: { result_name: string;[key: string]: any } | undefined;
    lastDiscardedCosts?: number[];
    lastDiscardedCost?: number;

    // === CLEANUP CONTROL ===
    suppressCleanup?: boolean;

    // === DEBUG ===
    __debugId?: number;

    // Index signature for dynamic properties
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
type _AssertActionReverse = keyof ActionByType extends ActionType
    ? true
    : never;
// Exact: ActionByType[K].type must equal K for all K
type _AssertActionExact = {
    [K in ActionType]: ActionByType[K]["type"] extends K
    ? K extends ActionByType[K]["type"]
    ? true
    : never
    : never;
};
type _AssertActionExactAll = _AssertActionExact[ActionType] extends true
    ? true
    : never;

// Force evaluation
const _actionChecks: [
    _AssertActionTotal,
    _AssertActionReverse,
    _AssertActionExactAll,
] = [true, true, true];

// Step 4: The Union Type (derived from mapping)
export type PlayerAction = ActionByType[ActionType];

// Legacy aliases for compatibility
export type HistoryAction =
    | ActionByType["UNDO"]
    | ActionByType["REDO"]
    | ActionByType["RESET_HISTORY"];
export type GameAction = ActionByType["END_TURN"];














