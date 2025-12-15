import { CardInstance, Effect, Player } from "../../../core/types.js";

export interface PendingTargetRequest {
    eff: Effect;
    owner: Player;
    sourceCard: CardInstance | null;
    resumeEffects: any[];
    pool: CardInstance[];
    selectCount: number;
}

export type KeywordEffectResult =
    | { kind: "done" }
    | { kind: "no-valid-targets" }
    | { kind: "request_target"; request: PendingTargetRequest };

import { KeywordName } from "./registry.js";

export { KeywordName };

export interface KeywordState {
    // Combat / Defense
    maxDamageCap?: number;
    cannotBeDestroyed?: boolean;
    can_attack_followers?: boolean; // Specific rush/storm sub-privilege
    isInvincibleOnAttack?: boolean;
    hasPiercing?: boolean;
    hasIntimidate?: boolean;

    // Death / Cleanup
    banishOnDeath?: boolean;
    lastWordsEffects?: Effect[];

    // Triggers / Hooks
    triggers?: any[]; // Replace with specific Trigger type if available

    // Mechanics
    hasRally?: boolean;
    rallyRequirement?: number;
    rallyEffects?: Effect[];

    hasFanfare?: boolean; // Marker

    hasStrike?: boolean;
    strikeEffects?: Effect[];

    hasEngage?: boolean;
    engageEffects?: Effect[];
    engageCost?: number;
    engageOncePerTurn?: boolean;
    engageSacrifice?: boolean;
    engagedThisTurn?: boolean;

    // Spellboost
    hasSpellboost?: boolean;
    spellboostCount?: number; // Note: Also exists on CardInstance?
    spellboost?: {
        reduceCostBy: number;
        minCost: number;
    };

    // Counters
    counters?: { [key: string]: number };

    // Class Specific
    hasPixieEnter?: boolean;
    pixieEnterEffects?: Effect[];

    hasAllyEnter?: boolean;
    allyEnterEffects?: Effect[];

    hasBleed?: boolean;
    bleed?: {
        toLeader: number;
        toSelf: number;
    };

    // Lock / Restrictions
    hasCantAttack?: boolean;
    cantAttack?: boolean; // redundancy in original?
    cantAttackFollowers?: boolean;
    cantAttackLeaders?: boolean;
    cantAttackExpiresOnTurn?: number;
    cantAttackIsTemporary?: boolean;
    cantAttackUntilOpponentEOT?: boolean;
    cantAttackOwner?: Player | null;

    // Barrier
    hasBarrier?: boolean;
}
