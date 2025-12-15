import { KeywordState } from "../logic/core/keywords/types.js";

export type Player = "blue" | "red";

export type EffectOp =
    | "add_counter" | "add_selected_copy_to_hand" | "add_shadows" | "add_to_hand"
    | "amulet_count_gate" | "attacks_per_turn"
    | "banish" | "banish_all_enemy_copies" | "banish_duplicates_from_deck" | "banish_random" | "banish_self"
    | "board_name_gate" | "both_max_pp_gate"
    | "buff" | "buff_hand_class" | "buff_last_added_to_hand" | "buff_self" | "buff_hand_tribe"
    | "chaos_split_damage" | "choose" | "choose_bonus_add"
    | "combo_add" | "combo_gate" | "combo_repeat_buff" | "congregant_fill_board"
    | "crest_add_counter" | "crest_pay_counter"
    | "damage" | "damage_all" | "damage_all_by_allied_golems" | "damage_enemy_leader_by_other_allies"
    | "damage_follower_or_leader" | "damage_highest_defense" | "damage_random" | "damage_random_selected_defense"
    | "damage_self" | "damage_split_all_enemies" | "damage_split_fixed" | "damage_split_sequential"
    | "destroy" | "destroy_all" | "destroy_allied_amulets_then_damage" | "destroy_defender_if_damaged"
    | "destroy_highest" | "destroy_random" | "destroy_random_other_allies" | "destroy_self" | "destroy_then"
    | "discard_all_except_named" | "discard_select_hand"
    | "double_stats_allies" | "dragonsign"
    | "draw" | "draw_all_named_with_keyword" | "draw_combo_follower" | "draw_filtered" | "draw_named" | "draw_opponent"
    | "dynamic_buff_self" | "dynamic_heal_leader"
    | "earth_rite" | "evolved_self_gate" | "evolve_all_unevolved_allies" | "evolve_self"
    | "fill_congregant_copies" | "follower_strike_destroy"
    | "fuse_finalize_fortifier" | "fuse_start" | "fuse"
    | "gain_crest" | "gain_max_pp"
    | "halve_deck_cost" | "hand_count_gate" | "heal_leader" | "himeka_crest_effect"
    | "increase_countdown" | "increase_opponent_hand_cost_eot"
    | "keyword" | "keyword_self" | "kuon_enhance"
    | "leader_barrier"
    | "modify_cost" | "modify_cost_pool"
    | "necromancy_gate" | "no_ally_attacked_this_turn_gate" | "no_duplicates_in_deck_gate"
    | "overflow_gate"
    | "reanimate" | "rally_gate" | "recover_pp" | "repeat_effect" | "reduce_cost" | "reduce_cost_self"
    | "reduce_countdown" | "reduce_deck_followers_cost" | "remove_keyword"
    | "replace_deck" | "replace_deck_with_set_minus"
    | "restore_full_defense_self" | "restore_self_and_heal_leader"
    | "return_hand_to_deck" | "return_to_hand"
    | "select" | "select_evolve_golem" | "select_hand_summon_artifact_copy" | "select_hand_summon_artifact_copies_eot_destroy"
    | "set_attack_to" | "set_deckout_victory" | "set_max_hp"
    | "spellboost" | "spellboost_hand" | "spellboost_target"
    | "start_fortifier_fuse" | "start_fuse_from_card" | "self_cost_gate" | "set_cost_last_drawn" | "set_cost_self"
    | "summon"
    | "super_evo_gate" | "super_evolve_ally" | "super_evolved_allied_gate" | "super_evolve_self" | "super_evolved_self_gate"
    | "summon_destroyed_amulet_highest_base_cost" | "summon_exact_copy" | "summon_named" | "summon_named_enemy" | "summon_random_from_deck"
    | "transform" | "transform_in_hand" | "transform_random_spell_in_hand" | "transform_self_if_spellboost_at_least"
    | "set_spellboost_count"
    | "notify_loot_played" | "rally" | "notify_burial" // passive ops
    | string;

export interface BaseEffect {
    op: EffectOp;
    effects?: Effect[]; // nested (success)
    else_effects?: Effect[]; // nested (failure)
    [key: string]: any;
}

export interface DamageEffect extends BaseEffect {
    op: "damage" | "damage_all" | "damage_random" | "damage_self" | "damage_follower_or_leader";
    amount?: number | string;
    add_amount?: number | string;
    target?: string;
}

export interface BuffEffect extends BaseEffect {
    op: "buff" | "buff_self";
    attack?: number | string;
    defense?: number | string;
}

export interface SummonEffect extends BaseEffect {
    op: "summon" | "summon_named" | "summon_exact_copy";
    name?: string;
    count?: number;
}

export interface GateEffect extends BaseEffect {
    op: "necromancy_gate" | "overflow_gate" | "hand_count_gate" | "rally_gate";
    cost?: number; // for necromancy
    count?: number; // for rally/hand
}

// Fallback for everything else
export interface GenericEffect extends BaseEffect {
    op: string;
}

export type Effect = DamageEffect | BuffEffect | SummonEffect | GateEffect | GenericEffect;

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

    // Runtime-like (template might not have them but they appear)
    cost_mod?: number;
    effectiveCost?: number;
    potential_defense?: number;
    countdown?: number | string;
    // barrierCharges?: number; // Removed
    peak_defense?: number;
    keywords?: (string | KeywordEntry)[];
    fanfare?: Effect[];
    enhanceTiers?: { cost: number; effects?: Effect[] }[];
    evoType?: "normal" | "super";
    lastWordsEffects?: Effect[];

    // Buff tracking
    buffs?: {
        attack?: number;
        defense?: number;
        [key: string]: any;
    };

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
}

export interface GameState {
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

    bluePlayedHistory: CardInstance[];
    redPlayedHistory: CardInstance[];
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
        canTargetLeader?: boolean;
        requiresConfirmation?: boolean;
        confirmationText?: string;
    };

    lastSummoned: CardInstance[];
    lastDrawnCards: CardInstance[];
    lastFuse?: { result_name: string;[key: string]: any };

    deckoutWinsBlue?: boolean;
    deckoutWinsRed?: boolean;

    blueLeaderBarrier?: number;
    redLeaderBarrier?: number;

    [key: string]: any;
}

export interface StartGameOptions {
    deckAId: string;
    deckBId: string;
    seed?: number;
}

// Action Payloads
export type TargetSpec =
    | { type: "card"; uid: string }
    | { type: "leader"; player: Player };

export type PlayCardAction = {
    type: "PLAY_CARD";
    player: Player;
    cardUid: string;
    // Optional targeting for the card being played (if it requires a target immediately, though usually handled by UI/ResolveTarget)
    // For now, minimal.
};

export type AttackAction = {
    type: "ATTACK";
    player: Player;
    attackerUid: string;
    defender: TargetSpec;
};

export type ChooseTargetAction = {
    type: "CHOOSE_TARGET";
    player: Player;
    target: TargetSpec;
};

export type HistoryAction = { type: "UNDO" } | { type: "REDO" } | { type: "RESET_HISTORY" };
export type GameAction = { type: "END_TURN" };

export type PlayerAction =
    | HistoryAction
    | GameAction
    | PlayCardAction
    | AttackAction
    | ChooseTargetAction;
