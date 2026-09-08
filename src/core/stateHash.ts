/**
 * @file State Hashing for Replay Verification
 *
 * Creates canonical hashes of game state for determinism checking.
 * Same seed + same actions MUST produce identical hash.
 */

import type { GameState, CardInstance } from "./types/index.js";
import type { KeywordState } from "../logic/core/keywords/types.js";

// ============================================================================
// STATIC EFFECT ARRAY EXCLUSIONS (deliberate — card data, not runtime state)
// ============================================================================

/**
 * Effect arrays excluded from canonicalizeCard — static card definition data.
 * Hashing them adds size/churn without determinism signal for replay/undo/soak.
 */
export const STATE_HASH_STATIC_EFFECT_EXCLUSIONS: Record<string, string> = {
  lastWordsEffects:
    "static Last Words script from card data; hasLastWords marker is hashed",
  engageEffects:
    "static Engage script from card data; engage runtime flags are hashed",
  rallyEffects:
    "static Rally script from card data; hasRally/rallyRequirement are hashed",
  triggers:
    "static trigger definitions from card data; not mutable runtime state",
  fanfare: "static Fanfare script on card.fanfare; hasFanfare marker is hashed",
  enhanceTiers:
    "static Enhance tiers from card data; PP tier selection is play-time logic",
  accelerateTiers:
    "static Accelerate tiers from card data; alternate form is play-time logic",
  crystallizeTiers:
    "static Crystallize tiers from card data; alternate form is play-time logic",
};

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

/** Debug / soak comparison — full canonical snapshot (game-relevant fields only). */
export function exportCanonicalState(state: GameState): object {
  return canonicalizeState(state);
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
    bluePP: state.players.first.pp + state.players.first.bonusPpOrb,
    redPP: state.players.second.pp + state.players.second.bonusPpOrb,
    blueBonusPpOrb: state.players.first.bonusPpOrb,
    redBonusPpOrb: state.players.second.bonusPpOrb,
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

function canonicalizeCounterMap(
  counters: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!counters) return undefined;
  const keys = Object.keys(counters).sort();
  if (keys.length === 0) return undefined;
  const out: Record<string, number> = {};
  for (const key of keys) {
    out[key] = counters[key]!;
  }
  return out;
}

function canonicalizeSpellboostCost(
  spellboost: KeywordState["spellboost"],
): { reduceCostBy: number; minCost: number } | undefined {
  if (!spellboost) return undefined;
  return {
    reduceCostBy: spellboost.reduceCostBy,
    minCost: spellboost.minCost,
  };
}

function canonicalizeBleed(
  bleed: KeywordState["bleed"],
): { toLeader: number; toSelf: number } | undefined {
  if (!bleed) return undefined;
  return {
    toLeader: bleed.toLeader,
    toSelf: bleed.toSelf,
  };
}

/**
 * Mutable keywordState fields included in the hash (sorted keys, undefined omitted).
 * Static effect arrays are excluded — see STATE_HASH_STATIC_EFFECT_EXCLUSIONS.
 */
function canonicalizeKeywordRuntime(
  ks: KeywordState | undefined,
): Record<string, unknown> | undefined {
  if (!ks) return undefined;

  const raw: Record<string, unknown> = {};

  if (ks.maxDamageCap != null) raw.maxDamageCap = ks.maxDamageCap;
  if (ks.cannotBeDestroyed) raw.cannotBeDestroyed = true;
  if (ks.can_attack_followers) raw.can_attack_followers = true;
  if (ks.isInvincibleOnAttack) raw.isInvincibleOnAttack = true;
  if (ks.hasPiercing) raw.hasPiercing = true;
  if (ks.banishOnDeath) raw.banishOnDeath = true;
  if (ks.hasRally) raw.hasRally = true;
  if (ks.rallyRequirement != null) raw.rallyRequirement = ks.rallyRequirement;
  if (ks.hasFanfare) raw.hasFanfare = true;
  if (ks.hasEngage) raw.hasEngage = true;
  if (ks.engageCost != null) raw.engageCost = ks.engageCost;
  if (ks.engageOncePerTurn === false) raw.engageOncePerTurn = false;
  if (ks.engageSacrifice) raw.engageSacrifice = true;
  if (ks.engagedThisTurn) raw.engagedThisTurn = true;
  if (ks.hasSpellboost) raw.hasSpellboost = true;
  if (ks.spellboostCount != null && ks.spellboostCount !== 0) {
    raw.spellboostCount = ks.spellboostCount;
  }
  const spellboostCost = canonicalizeSpellboostCost(ks.spellboost);
  if (spellboostCost) raw.spellboost = spellboostCost;
  const ksCounters = canonicalizeCounterMap(ks.counters);
  if (ksCounters) raw.counters = ksCounters;
  if (ks.hasBleed) raw.hasBleed = true;
  const bleed = canonicalizeBleed(ks.bleed);
  if (bleed) raw.bleed = bleed;
  if (ks.hasCantAttack) raw.hasCantAttack = true;
  if (ks.cantAttack) raw.cantAttack = true;
  if (ks.cantAttackFollowers) raw.cantAttackFollowers = true;
  if (ks.cantAttackLeaders) raw.cantAttackLeaders = true;
  if (ks.cantAttackExpiresOnTurn != null) {
    raw.cantAttackExpiresOnTurn = ks.cantAttackExpiresOnTurn;
  }
  if (ks.cantAttackIsTemporary) raw.cantAttackIsTemporary = true;
  if (ks.cantAttackUntilOpponentEOT) raw.cantAttackUntilOpponentEOT = true;
  if (ks.cantAttackOwner != null) raw.cantAttackOwner = ks.cantAttackOwner;

  const keys = Object.keys(raw).sort();
  if (keys.length === 0) return undefined;

  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = raw[key];
  }
  return out;
}

function canonicalizeCountdown(card: CardInstance): number | undefined {
  if (!card.hasCountdown && card.countdown == null) return undefined;
  const value = Number(card.countdown);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function canonicalizeSpellboostCount(card: CardInstance): number | undefined {
  const fromCard = card.spellboostCount;
  const fromKs = card.keywordState?.spellboostCount;
  const value =
    fromCard != null ? fromCard : fromKs != null ? fromKs : undefined;
  if (value == null || value === 0) return undefined;
  return value;
}

/**
 * Canonicalize a card for hashing.
 * Only include game-relevant properties.
 */
function canonicalizeCard(card: CardInstance | null | undefined): object {
  if (!card) return { id: null, uid: null, name: null };

  const keywordRuntime = canonicalizeKeywordRuntime(card.keywordState);
  const spellboostCount = canonicalizeSpellboostCount(card);
  const countdown = canonicalizeCountdown(card);

  const base: Record<string, unknown> = {
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
    hasAmbush: !!card.hasAmbush,
    hasAura: !!card.hasAura,
    hasIntimidate: !!card.hasIntimidate,
    hasCountdown: !!card.hasCountdown,
    hasLastWords: !!card.hasLastWords,
    hasTaunt: !!card.hasTaunt,
    hasEngage: !!card.hasEngage,
    isEvolved: !!card.isEvolved,
    evoType: card.evoType,
    counters: card.counters || {},
  };

  if (countdown != null) base.countdown = countdown;
  if (spellboostCount != null) base.spellboostCount = spellboostCount;
  if (keywordRuntime) base.keywordRuntime = keywordRuntime;

  const keys = Object.keys(base).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = base[key];
  }
  return out;
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
