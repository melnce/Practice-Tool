/**
 * Behavioural fingerprint of game state for card-equivalence checks.
 *
 * Separate from `hashGameState` / replay capsules so extending the fingerprint
 * cannot silently break golden replays.
 */

import type { CardInstance, GameState } from "../../src/core/types/index.js";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

/** FNV-1a — same family as stateHash, local copy so this stays self-contained. */
export function fnv1aHex(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function fingerprintCard(card: CardInstance | null | undefined): object {
  if (!card) return { id: null, uid: null, name: null };
  const kw = card.keywordState ?? {};
  return {
    id: card.id ?? null,
    uid: card.uid ?? null,
    name: card.name ?? null,
    type: card.type ?? null,
    attack: card.attack ?? null,
    defense: card.defense ?? null,
    cost: card.cost ?? null,
    countdown: card.countdown ?? null,
    counters: card.counters ?? {},
    hasWard: !!card.hasWard,
    hasBane: !!card.hasBane,
    hasDrain: !!card.hasDrain,
    hasStorm: !!card.hasStorm,
    hasRush: !!card.hasRush,
    hasBarrier: !!(card.hasBarrier || (kw as any).hasBarrier),
    hasAmbush: !!(card as any).hasAmbush,
    isEvolved: !!card.isEvolved || !!card.hasEvolved,
    evoType: card.evoType ?? null,
    keywords: Array.isArray(card.keywords)
      ? card.keywords.map((k) =>
          typeof k === "string" ? k : ((k as any)?.name ?? k),
        )
      : [],
    can_attack: !!(card as any).can_attack,
    hasAttacked: !!card.hasAttacked,
  };
}

function fingerprintCrest(crest: {
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

function fingerprintPending(state: GameState): object | null {
  const pending = state.pendingTargetEffect;
  if (!pending) return null;
  return {
    op: (pending.eff as any)?.op ?? null,
    selectCount: pending.selectCount ?? null,
    poolUids: (
      pending.poolUids ??
      pending.pool?.map((c) => c.uid) ??
      []
    ).slice(),
    targetUids: (
      pending.targetUids ??
      pending.targets?.map((c) => c.uid) ??
      []
    ).slice(),
    canTargetLeader: !!pending.canTargetLeader,
    resumeOps: (pending.resumeEffects ?? []).map((e: any) => e?.op ?? null),
  };
}

/**
 * Full behavioural snapshot used for per-card equivalence.
 * Same seed + same drive path must yield an identical object (key-sorted).
 */
export function fingerprintGameState(state: GameState): object {
  const raw = {
    activePlayer: state.activePlayer,
    roundCount: state.roundCount,
    turnNumber: state.turnNumber,
    gameTick: state.gameTick,
    phase: state.phase ?? null,
    rng: state.rng.snapshot(),
    pending: fingerprintPending(state),
    players: {
      first: {
        hp: state.players.first.hp,
        maxHP: state.players.first.maxHP,
        pp: state.players.first.pp,
        maxPP: state.players.first.maxPP,
        shadows: state.players.first.shadows,
        rally: state.players.first.rally,
        evoCharges: state.players.first.evoCharges,
        superEvoCharges: state.players.first.superEvoCharges,
        evoCount: state.players.first.evoCount,
        leaderBarrier: state.players.first.leaderBarrier,
        crests: state.players.first.crests.map(fingerprintCrest),
        hand: state.players.first.hand.map(fingerprintCard),
        board: state.players.first.board.map(fingerprintCard),
        deck: state.players.first.deck.map((c) => ({
          id: c.id,
          uid: c.uid,
          name: c.name,
        })),
        graveyard: state.players.first.graveyard.map(fingerprintCard),
        banish: state.players.first.banish.map(fingerprintCard),
      },
      second: {
        hp: state.players.second.hp,
        maxHP: state.players.second.maxHP,
        pp: state.players.second.pp,
        maxPP: state.players.second.maxPP,
        shadows: state.players.second.shadows,
        rally: state.players.second.rally,
        evoCharges: state.players.second.evoCharges,
        superEvoCharges: state.players.second.superEvoCharges,
        evoCount: state.players.second.evoCount,
        leaderBarrier: state.players.second.leaderBarrier,
        crests: state.players.second.crests.map(fingerprintCrest),
        hand: state.players.second.hand.map(fingerprintCard),
        board: state.players.second.board.map(fingerprintCard),
        deck: state.players.second.deck.map((c) => ({
          id: c.id,
          uid: c.uid,
          name: c.name,
        })),
        graveyard: state.players.second.graveyard.map(fingerprintCard),
        banish: state.players.second.banish.map(fingerprintCard),
      },
    },
  };
  return sortKeys(raw) as object;
}

export function hashFingerprint(detail: object): string {
  return fnv1aHex(JSON.stringify(detail));
}
