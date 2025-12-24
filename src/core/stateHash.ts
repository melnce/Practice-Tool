/**
 * @file State Hashing for Replay Verification
 * 
 * Creates canonical hashes of game state for determinism checking.
 * Same seed + same actions MUST produce identical hash.
 */

import type { GameState, CardInstance } from "./types.js";

// ============================================================================
// CANONICAL STATE HASH
// ============================================================================

/**
 * Create a deterministic hash of the game state.
 * Used for replay verification - same seed + actions = same hash.
 */
export function hashGameState(state: GameState): string {
    const canonical = canonicalizeState(state);
    return simpleHash(JSON.stringify(canonical));
}

/**
 * Create a canonical, deterministic representation of state.
 * Strips non-deterministic fields (timestamps, UI flags).
 */
function canonicalizeState(state: GameState): object {
    return {
        // Turn state
        activePlayer: state.activePlayer,
        roundCount: state.roundCount,

        // Resources
        blueHP: state.players.first.hp,
        redHP: state.players.second.hp,
        bluePP: state.players.first.pp,
        redPP: state.players.second.pp,
        blueMaxPP: state.players.first.maxPP,
        redMaxPP: state.players.second.maxPP,
        blueShadows: state.players.first.shadows,
        redShadows: state.players.second.shadows,
        blueRally: state.players.first.rally,
        redRally: state.players.second.rally,

        // Evo state
        blueEvoCharges: state.players.first.evoCharges,
        redEvoCharges: state.players.second.evoCharges,
        blueSuperEvoCharges: state.players.first.superEvoCharges,
        redSuperEvoCharges: state.players.second.superEvoCharges,

        // Zones (canonicalized cards)
        blueHand: state.players.first.hand.map(canonicalizeCard),
        redHand: state.players.second.hand.map(canonicalizeCard),
        blueBoard: state.players.first.board.map(canonicalizeCard),
        redBoard: state.players.second.board.map(canonicalizeCard),
        blueDeck: state.players.first.deck.length, // Just count for performance
        redDeck: state.players.second.deck.length,
        blueGraveyard: state.players.first.graveyard.map(c => c.id),
        redGraveyard: state.players.second.graveyard.map(c => c.id),
    };
}

/**
 * Canonicalize a card for hashing.
 * Only include game-relevant properties.
 */
function canonicalizeCard(card: CardInstance): object {
    return {
        id: card.id,
        uid: card.uid,
        name: card.name,
        type: card.type,
        attack: card.attack,
        defense: card.defense,
        cost: card.cost,
        hasWard: !!card.hasWard,
        hasBane: !!card.hasBane,
        hasDrain: !!card.hasDrain,
        hasStorm: !!card.hasStorm,
        hasRush: !!card.hasRush,
        hasBarrier: !!card.hasBarrier,
        isEvolved: !!card.isEvolved,
        evoType: card.evoType,
        counters: card.counters || {},
    };
}

/**
 * Simple FNV-1a hash for strings.
 * Deterministic and fast.
 */
function simpleHash(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

// ============================================================================
// REPLAY VERIFICATION
// ============================================================================

export interface ReplayStep {
    actionType: string;
    stateHashBefore: string;
    stateHashAfter: string;
}

export interface ReplayLog {
    seed: number | string;
    steps: ReplayStep[];
    finalHash: string;
}

/**
 * Verify two replay logs match (same seed + actions = same hashes).
 */
export function verifyReplayMatch(logA: ReplayLog, logB: ReplayLog): {
    match: boolean;
    mismatchAt?: number;
    message: string;
} {
    if (logA.seed !== logB.seed) {
        return { match: false, message: `Seed mismatch: ${logA.seed} !== ${logB.seed}` };
    }

    if (logA.steps.length !== logB.steps.length) {
        return {
            match: false,
            message: `Step count mismatch: ${logA.steps.length} !== ${logB.steps.length}`
        };
    }

    for (let i = 0; i < logA.steps.length; i++) {
        const stepA = logA.steps[i]!;
        const stepB = logB.steps[i]!;

        if (stepA.stateHashAfter !== stepB.stateHashAfter) {
            return {
                match: false,
                mismatchAt: i,
                message: `Desync at step ${i} (${stepA.actionType}): ${stepA.stateHashAfter} !== ${stepB.stateHashAfter}`,
            };
        }
    }

    if (logA.finalHash !== logB.finalHash) {
        return {
            match: false,
            message: `Final hash mismatch: ${logA.finalHash} !== ${logB.finalHash}`
        };
    }

    return { match: true, message: "Replay verified: identical" };
}














