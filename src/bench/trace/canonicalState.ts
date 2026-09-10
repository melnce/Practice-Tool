// src/bench/trace/canonicalState.ts — CanonicalState projection

import type {
  GameState,
  CardInstance,
  Player,
} from "../../core/types/index.js";
import { getGlobalCardIndex } from "../../data/cardIndex.js";
import { isGameOver } from "../../core/gameOver.js";
import {
  getBoard,
  getHand,
  getDeck,
  getGraveyard,
  getPlaysThisTurn,
} from "../../core/playerHelpers.js";
import type {
  CanonicalState,
  FieldSlot,
  HandEntry,
  PlayerCanonical,
  TracePlayer,
  CanonicalPhase,
} from "./types.js";

export function playerToTrace(p: Player): TracePlayer {
  return p === "first" ? "a" : "b";
}

export function traceToPlayer(t: TracePlayer): Player {
  return t === "a" ? "first" : "second";
}

function sortedMultiset(cards: CardInstance[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (!c?.id) continue;
    const id = String(c.id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(counts).sort()) {
    sorted[key] = counts[key]!;
  }
  return sorted;
}

function traitTags(card: CardInstance): string[] {
  const tags = new Set<string>();
  const add = (name: string) => {
    const n = name.toLowerCase().replace(/[\s_]/g, "");
    if (n) tags.add(n === "lastwords" ? "lastwords" : n);
  };
  if (card.ambush || card.hasAmbush) add("ambush");
  if (card.ward || card.hasWard) add("ward");
  if (card.storm || card.hasStorm) add("storm");
  if (card.hasRush || card.isRush) add("rush");
  if (card.hasBane) add("bane");
  if (card.hasBarrier) add("barrier");
  if (card.hasIntimidate) add("intimidate");
  if (card.keywords) {
    for (const k of card.keywords) {
      const name = typeof k === "string" ? k : k?.name;
      if (name) add(name);
    }
  }
  return [...tags].sort();
}

function grantedTags(card: CardInstance): string[] | undefined {
  const tags = new Set<string>();
  const ks = card.keywordState;
  if (ks?.lastWordsEffects?.length || card.lastWordsEffects?.length) {
    tags.add("lastWords");
  }
  if (ks?.hasFanfare) tags.add("fanfare");
  if (ks?.hasEngage || card.hasEngage) tags.add("engage");
  if (ks?.triggers?.length) {
    for (const t of ks.triggers) {
      const ev = String(t?.event ?? t?.type ?? "").trim();
      if (ev) tags.add(ev.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
    }
  }
  if (card.triggers?.length) {
    for (const t of card.triggers) {
      const ev = String(t?.event ?? t?.type ?? "").trim();
      if (ev) tags.add(ev);
    }
  }
  if (tags.size === 0) return undefined;
  return [...tags].sort();
}

function xyzVars(card: CardInstance): Record<string, number> | undefined {
  const counters = card.counters;
  if (!counters) return undefined;
  const out: Record<string, number> = {};
  for (const key of ["X", "Y", "Z"]) {
    const v = counters[key];
    if (v != null && Number.isFinite(v)) out[key] = v | 0;
  }
  return Object.keys(out).length ? out : undefined;
}

function fieldSlot(card: CardInstance): FieldSlot {
  const atk = Number(card.attack ?? 0) | 0;
  const def = Number(card.defense ?? 0) | 0;
  const maxDef =
    Number(card.peak_defense ?? card.base_defense ?? card.defense ?? 0) | 0;
  const slot: FieldSlot = {
    attack: atk,
    attacks_left: Number(card.attacks_left ?? 1) | 0,
    can_attack: !!card.can_attack,
    card: String(card.id),
    countdown:
      card.type === "Amulet" && card.countdown != null
        ? Number(card.countdown) | 0
        : null,
    defense: def,
    evolved: !!(card.hasEvolved || card.evoType),
    max_defense: maxDef,
    super: card.evoType === "super" || !!(card as any).superEvolved,
    traits: traitTags(card),
  };
  const vars = xyzVars(card);
  if (vars) slot.vars = vars;
  const granted = grantedTags(card);
  if (granted) slot.granted = granted;
  return slot;
}

function handEntry(card: CardInstance): HandEntry {
  const entry: HandEntry = {
    card: String(card.id),
    cost: Number(card.effectiveCost ?? card.cost ?? 0) | 0,
  };
  const vars = xyzVars(card);
  if (vars) entry.vars = vars;
  const sb = card.skyboundArtEvolvesWitnessed;
  if (sb != null && sb > 0) entry.skybound = sb | 0;
  return entry;
}

function resolveCrestId(name: string): string {
  const index = getGlobalCardIndex();
  if (name.startsWith("Faith: ")) {
    const cardName = name.slice("Faith: ".length);
    const card = index?.byName.get(cardName);
    if (card?.id) return `faith:${card.id}`;
  }
  const card = index?.byName.get(name);
  if (card?.id) return `crest:${card.id}`;
  return `crest:${name}`;
}

function earthSum(state: GameState, player: Player): number {
  const board = getBoard(state, player);
  return board
    .filter((c) => c?.type === "Amulet" && (c.counters?.earth || 0) > 0)
    .reduce((acc, c) => acc + (c.counters?.earth || 0), 0);
}

function faithSum(state: GameState, player: Player): number {
  const crests = state.players[player].crests ?? [];
  let sum = 0;
  for (const c of crests) {
    sum += Number(c.counters?.faith ?? 0) | 0;
  }
  return sum;
}

function projectPlayer(state: GameState, player: Player): PlayerCanonical {
  const ps = state.players[player];
  const board = getBoard(state, player);
  const field: (FieldSlot | null)[] = [];
  for (let i = 0; i < 5; i++) {
    const c = board[i];
    field.push(c ? fieldSlot(c) : null);
  }
  while (field.length < 5) field.push(null);

  const crests = (ps.crests ?? []).map((c) => {
    const entry: { countdown?: number; id: string } = {
      id: resolveCrestId(c.name),
    };
    if (c.countdown != null) entry.countdown = Number(c.countdown) | 0;
    return entry;
  });

  return {
    banished: sortedMultiset(ps.banish ?? []),
    cemetery: sortedMultiset(getGraveyard(state, player)),
    combo: getPlaysThisTurn(state, player) | 0,
    crests,
    deck: sortedMultiset(getDeck(state, player)),
    earth: earthSum(state, player),
    ep: ps.evoCharges | 0,
    evolves_used: ps.evoCount | 0,
    faith: faithSum(state, player),
    field,
    hand: getHand(state, player).map(handEntry),
    leader_defense: ps.hp | 0,
    leader_max: ps.maxHP | 0,
    pp: ps.pp | 0,
    pp_bonus: ps.bonusPpOrb | 0,
    pp_max: ps.maxPP | 0,
    rally: ps.rally | 0,
    sep: ps.superEvoCharges | 0,
    shadows: ps.shadows | 0,
  };
}

function resolvePhase(state: GameState): CanonicalPhase {
  if (isGameOver(state) || state.phase === "gameover") return "terminal";
  if (state.phase === "mulligan") return "mulligan";
  if (state.pendingTargetEffect || state.pendingModeChoice) return "choice";
  return "main";
}

export function toCanonicalState(state: GameState): CanonicalState {
  return {
    active: playerToTrace(state.activePlayer),
    phase: resolvePhase(state),
    players: {
      a: projectPlayer(state, "first"),
      b: projectPlayer(state, "second"),
    },
    turn: state.turnNumber | 0,
    winner: state.winner ? playerToTrace(state.winner) : null,
  };
}

/** Sorted JSON for trace lines (keys sorted recursively). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function deckMultisetToSortedArray(
  multiset: Record<string, number>,
): string[] {
  const out: string[] = [];
  for (const id of Object.keys(multiset).sort()) {
    for (let i = 0; i < multiset[id]!; i++) out.push(id);
  }
  return out;
}
