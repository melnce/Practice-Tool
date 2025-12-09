// gameState.ts
import { logEvent } from "@core/logger.js";
// We cast the initial state to GameState.
// Note: We initialize with some defaults that match the type.
export const state = {
    blueDeck: [], redDeck: [],
    blueHand: [], redHand: [],
    blueBoard: [], redBoard: [],
    blueGraveyard: [], redGraveyard: [],
    bluePlayedHistory: [], redPlayedHistory: [],
    blueDestroyedHistory: [], redDestroyedHistory: [],
    blueCrests: [],
    redCrests: [],
    blueChooseBonus: 0,
    redChooseBonus: 0,
    shikigamiDeathsThisTurnBlue: [],
    shikigamiDeathsThisTurnRed: [],
    blueHP: 20, redHP: 20,
    blueMaxHP: 20, redMaxHP: 20,
    bluePP: 1, redPP: 1,
    blueMaxPP: 1, redMaxPP: 1,
    bluePermPP: 0, redPermPP: 0,
    blueShadows: 0,
    redShadows: 0,
    isBlueTurn: true,
    roundCount: 1,
    blueRally: 0,
    redRally: 0,
    // Evolution charges (2 normal, 2 super)
    blueEvoCharges: 2,
    redEvoCharges: 2,
    blueSuperEvoCharges: 2,
    redSuperEvoCharges: 2,
    // Track evolution usage per turn
    blueEvoUsedThisTurn: false,
    redEvoUsedThisTurn: false,
    redBoostUsedEarly: false,
    redBoostUsedLate: false,
    redBoostPending: false,
    bluePlaysThisTurn: 0,
    redPlaysThisTurn: 0,
    gameStarted: false
};
export function resetGameState() {
    state.blueDeck.length = 0;
    state.redDeck.length = 0;
    state.blueHand.length = 0;
    state.redHand.length = 0;
    state.blueBoard.length = 0;
    state.redBoard.length = 0;
    state.blueGraveyard.length = 0;
    state.redGraveyard.length = 0;
    state.bluePlayedHistory.length = 0;
    state.redPlayedHistory.length = 0;
    state.blueDestroyedHistory.length = 0;
    state.redDestroyedHistory.length = 0;
    state.blueCrests.length = 0;
    state.redCrests.length = 0;
    state.blueChooseBonus = 0;
    state.redChooseBonus = 0;
    state.shikigamiDeathsThisTurnBlue = [];
    state.shikigamiDeathsThisTurnRed = [];
    // Reset evolution charges
    state.blueEvoCharges = 2;
    state.redEvoCharges = 2;
    state.blueSuperEvoCharges = 2;
    state.redSuperEvoCharges = 2;
    state.blueEvoUsedThisTurn = false;
    state.redEvoUsedThisTurn = false;
    state.blueHP = 20;
    state.redHP = 20;
    state.blueMaxHP = 20;
    state.redMaxHP = 20;
    state.bluePP = 1;
    state.redPP = 1;
    state.blueMaxPP = 1;
    state.redMaxPP = 1;
    state.bluePermPP = 0;
    state.redPermPP = 0;
    state.blueShadows = 0;
    state.redShadows = 0;
    state.blueRally = 0;
    state.redRally = 0;
    state.isBlueTurn = true;
    state.roundCount = 1;
    state.redBoostUsedEarly = false;
    state.redBoostPending = false;
    state.redBoostUsedLate = false;
    state.bluePlaysThisTurn = 0;
    state.redPlaysThisTurn = 0;
    state.gameStarted = false;
    // Log the game state reset
    logEvent("resetGameState", {});
}
if (typeof window !== "undefined") {
    window.gameState = state;
    window.debugSummon = () => import('@logic/effects/ops/summon.js');
}
