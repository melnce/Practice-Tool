// =============================================================================
// PLAYER STATE FACTORY
// =============================================================================
// Runtime factory function for creating PlayerState objects.
// Separated from type definitions to allow type-only imports.

import type { PlayerState } from "./types/player.js";

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
        banish: [],

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
        defeated: false,
    };
}
