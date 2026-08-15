/**
 * @file State Hashing for Replay Verification
 *
 * Creates canonical hashes of game state for determinism checking.
 * Same seed + same actions MUST produce identical hash.
 */

import type { GameState, CardInstance } from "./types/index.js";

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
    turnNumber: state.turnNumber,
    gameTick: state.gameTick,
    phase: state.phase ?? null,
    gameStarted: !!state.gameStarted,

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
    blueFollowerEnterHistory: (
      state.players.first.followerEnterHistory ?? []
    ).map((r) => `${r.cardId}:${r.name}`),
    redFollowerEnterHistory: (
      state.players.second.followerEnterHistory ?? []
    ).map((r) => `${r.cardId}:${r.name}`),
    blueDestroyedHistory: (state.players.first.destroyedHistory ?? []).map(
      (r) => `${r.name}:${r.id}`,
    ),
    redDestroyedHistory: (state.players.second.destroyedHistory ?? []).map(
      (r) => `${r.name}:${r.id}`,
    ),

    // Evo state
    blueEvoCharges: state.players.first.evoCharges,
    redEvoCharges: state.players.second.evoCharges,
    blueSuperEvoCharges: state.players.first.superEvoCharges,
    redSuperEvoCharges: state.players.second.superEvoCharges,
    blueEvoCount: state.players.first.evoCount,
    redEvoCount: state.players.second.evoCount,

    // Leader / crest / metrics
    blueLeaderBarrier: state.players.first.leaderBarrier,
    redLeaderBarrier: state.players.second.leaderBarrier,
    blueCrests: state.players.first.crests.map(canonicalizeCrest),
    redCrests: state.players.second.crests.map(canonicalizeCrest),
    blueTotalDamageDealt: state.players.first.totalDamageDealt,
    redTotalDamageDealt: state.players.second.totalDamageDealt,

    // Zones (canonicalized cards)
    blueHand: state.players.first.hand.map(canonicalizeCard),
    redHand: state.players.second.hand.map(canonicalizeCard),
    blueBoard: state.players.first.board.map(canonicalizeCard),
    redBoard: state.players.second.board.map(canonicalizeCard),
    // P0-2 FIX: Include deck card IDs for proper state fingerprinting (was length only)
    blueDeck: state.players.first.deck.map((c) => c.id),
    redDeck: state.players.second.deck.map((c) => c.id),
    // P1-4: Use canonicalizeCard for graveyard (was ID only)
    blueGraveyard: state.players.first.graveyard.map(canonicalizeCard),
    redGraveyard: state.players.second.graveyard.map(canonicalizeCard),
    blueBanish: state.players.first.banish.map(canonicalizeCard),
    redBanish: state.players.second.banish.map(canonicalizeCard),

    // RNG cursor — required so advanced draws change the hash
    rng: state.rng.snapshot(),
  };
}

function canonicalizeCrest(crest: {
  name?: string;
  countdown?: number;
  counters?: Record<string, number>;
}): object {
  return {
    name: crest.name ?? null,
    countdown: crest.countdown ?? null,
    counters: crest.counters ?? {},
  };
}

/**
 * Canonicalize a card for hashing.
 * Only include game-relevant properties.
 */
function canonicalizeCard(card: CardInstance | null | undefined): object {
  if (!card) return { id: null, uid: null, name: null };
  return {
    id: card.id,
    uid: card.uid,
    name: card.name,
    type: card.type,
    attack: card.attack,
    defense: card.defense,
    cost: card.cost,
    hasWard: !!card.hasWard,
    ignoresWard: !!card.ignoresWard,
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
export function verifyReplayMatch(
  logA: ReplayLog,
  logB: ReplayLog,
): {
  match: boolean;
  mismatchAt?: number;
  message: string;
} {
  if (logA.seed !== logB.seed) {
    return {
      match: false,
      message: `Seed mismatch: ${logA.seed} !== ${logB.seed}`,
    };
  }

  if (logA.steps.length !== logB.steps.length) {
    return {
      match: false,
      message: `Step count mismatch: ${logA.steps.length} !== ${logB.steps.length}`,
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
      message: `Final hash mismatch: ${logA.finalHash} !== ${logB.finalHash}`,
    };
  }

  return { match: true, message: "Replay verified: identical" };
}
