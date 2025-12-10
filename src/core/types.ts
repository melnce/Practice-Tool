export type Player = "blue" | "red";

export type EffectOp =
    | "banish"
    | "bounce"
    | "buff"
    | "choose"
    | "damage"
    | "destroy"
    | "draw"
    | "engage"
    | "evolve"
    | "misc"
    | "reanimate"
    | "returnHandToDeck"
    | "spellboost"
    | "summon"
    | "transform"
    | "fuse"
    | string; // Allow others for now

export interface Effect {
    op: EffectOp;
    effects?: Effect[];
    [key: string]: any;
}

export interface KeywordEntry {
    name: string;
    cost?: number;
    effects?: Effect[];
    key?: string;
    count?: number;
    reduceCostBy?: number;
    minCost?: number;
    destroyOnEmpty?: boolean;
    [key: string]: any; // Allow loose typing for now
}

export interface CardTemplate {
    uid: string;
    name: string;
    type: "Follower" | "Amulet" | string;
    class?: string;
    tribes?: string[];
    description?: string;
    base_image?: string;
    image?: string;
    evo_image?: string;
    cost?: number | string;
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

    // Cost modifiers
    cost_mod?: number;
    base_cost?: number | string;
    effectiveCost?: number;
    potential_defense?: number;

    // Numeric stats
    countdown?: number | string;
    barrierCharges?: number;
    peak_defense?: number;

    // Complex
    keywords?: (string | KeywordEntry)[];
    fanfare?: Effect[];
    enhanceTiers?: { cost: number; effects?: Effect[] }[];
    evoType?: "normal" | "super";

    [key: string]: any;
}

// Runtime instance of a card, often same as template but with runtime modifications
export interface CardInstance extends CardTemplate {
    // Runtime specific fields
    owner?: Player;
    zone?: string;
    instanceId?: string | number;
    originalCost?: number;

    // UI flags
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

    // Evo
    blueEvoCharges: number;
    redEvoCharges: number;
    blueSuperEvoCharges: number;
    redSuperEvoCharges: number;
    blueEvoUsedThisTurn: boolean;
    redEvoUsedThisTurn: boolean;

    // Stats
    bluePlaysThisTurn: number;
    redPlaysThisTurn: number;

    blueChooseBonus: number;
    redChooseBonus: number;

    shikigamiDeathsThisTurnBlue: any[];
    shikigamiDeathsThisTurnRed: any[];

    redBoostUsedEarly: boolean;
    redBoostUsedLate: boolean;
    redBoostPending: boolean;

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

    // Runtime tracking (not persisted in saves usually, but needed for effects)
    lastSummoned?: CardInstance[];
    lastDrawnCards?: CardInstance[];
    deckoutWinsBlue?: boolean;
    deckoutWinsRed?: boolean;

    [key: string]: any;
}
