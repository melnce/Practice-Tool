import type { CardInstance, GameState } from "../../core/types/index.js";
import { state as gameState } from "../../core/gameState.js";
import type { ZoneContext, CardViewModel } from "./types.js";
import { createCardViewModel } from "./viewModel.js";

interface CacheEntry {
  lastStateArgs: StateArgs;
  lastCardArgs: CardArgs;
  viewModel: CardViewModel;
}

type StateArgs = {
  pp: number;
  turn: boolean;
  activePlayer: string;
  rally: string;
  shadows: string;
  boardLens: string;
  targetId: string;
};

type CardArgs = {
  cost: number;
  costMod: number;
  atk: number;
  def: number;
  baseAtk: number;
  baseDef: number;
  buffs: string;
  selectable: boolean;
  targetSelected: boolean;
  mulligan: boolean;
  attacked: boolean;
  evolved: boolean;
  evoType: string;
  cardType: string;
  rarity: string;
  classKey: string;
  keywordFlags: string;
  canAttackFlag: boolean;
  justPlayed: boolean;
  hasEngage: boolean;
  counters: string;
  keywordsLen: number;
  kwStateHash: string;
  countdown: number;
  spellboost: string;
  skybound: number;
  icarusBuff: number;
  idx: number;
};

const vmCache = new WeakMap<CardInstance, CacheEntry>();

function isCardTargetSelected(card: CardInstance): boolean {
  const uids = gameState.pendingTargetEffect?.targetUids;
  return Array.isArray(uids) && uids.includes(card.uid);
}

function spellboostSnapshot(card: CardInstance): string {
  const keys = [
    "spellboostCount",
    "spellBoostCount",
    "spellboosts",
    "spell_boosts",
    "spellboost_counter",
  ] as const;
  for (const key of keys) {
    if (key in card) return `${key}:${(card as Record<string, unknown>)[key]}`;
  }
  return "";
}

function keywordFlagsHash(card: CardInstance): string {
  return [
    card.hasStorm,
    card.hasRush || card.isRush,
    card.hasBane,
    card.hasDrain,
    card.hasAmbush,
    card.hasAura,
    card.hasIntimidate,
    card.hasBarrier,
    card.hasWard,
  ]
    .map((v) => (v ? "1" : "0"))
    .join("");
}

function kwStateHash(card: CardInstance): string {
  const ks = card.keywordState || {};
  return [
    ks.engagedThisTurn ?? "f",
    ks.cantAttack ?? "f",
    ks.cantAttackFollowers ?? "f",
    ks.cantAttackLeaders ?? "f",
    ks.hasCantAttack ?? "f",
    ks.engageCost ?? "",
  ].join("|");
}

function buildCardArgs(card: CardInstance, idx: number): CardArgs {
  return {
    cost: Number(card.cost ?? 0),
    costMod: Number(card.cost_mod ?? 0),
    atk: Number(card.attack ?? 0),
    def: Number(card.defense ?? 0),
    baseAtk: Number(card.base_attack ?? card.attack ?? 0),
    baseDef: Number(card.base_defense ?? card.defense ?? 0),
    buffs: `${card.buffs?.attack ?? 0}|${card.buffs?.defense ?? 0}`,
    selectable: !!card.__uiSelectable,
    targetSelected: isCardTargetSelected(card),
    mulligan: !!card.__mulliganSelected,
    attacked: !!card.hasAttacked,
    evolved: !!card.hasEvolved,
    evoType: String(card.evoType ?? ""),
    cardType: String(card.type ?? ""),
    rarity: String((card as { rarity?: string }).rarity ?? ""),
    classKey: String(card.class ?? ""),
    keywordFlags: keywordFlagsHash(card),
    canAttackFlag: !!card.can_attack,
    justPlayed: !!card.justPlayed,
    hasEngage: !!card.hasEngage,
    countdown: Number(card.countdown ?? -1),
    keywordsLen: card.keywords?.length ?? 0,
    kwStateHash: kwStateHash(card),
    counters: card.counters ? JSON.stringify(card.counters) : "",
    spellboost: spellboostSnapshot(card),
    skybound: Number(card.skyboundArtEvolvesWitnessed ?? 0),
    icarusBuff: Number(card.__icarusBuff ?? 0),
    idx,
  };
}

function isStateSame(
  prev: StateArgs,
  state: GameState,
  ctx: ZoneContext,
): boolean {
  const isBlue = ctx.owner === "first";
  const pp = isBlue ? state.players.first.pp : state.players.second.pp;
  const isFirstActive = state.activePlayer === "first";
  const isMyTurn = (isBlue && isFirstActive) || (!isBlue && !isFirstActive);

  if (prev.pp !== pp) return false;
  if (prev.turn !== isMyTurn) return false;
  if (prev.activePlayer !== state.activePlayer) return false;

  if (prev.boardLens !== `${state.players.first.board.length}|${state.players.second.board.length}`)
    return false;

  const targetOp = state.pendingTargetEffect?.eff?.op ?? "";
  if (prev.targetId !== targetOp) return false;

  if (prev.rally !== `${state.players.first.rally}|${state.players.second.rally}`) return false;
  if (prev.shadows !== `${state.players.first.shadows}|${state.players.second.shadows}`) return false;

  return true;
}

function isCardSame(prev: CardArgs, card: CardInstance, idx: number): boolean {
  const next = buildCardArgs(card, idx);
  return (Object.keys(prev) as Array<keyof CardArgs>).every((k) => prev[k] === next[k]);
}

export function getMemoizedViewModel(
  card: CardInstance,
  idx: number,
  ctx: ZoneContext,
  state: GameState,
): CardViewModel {
  const cached = vmCache.get(card);

  if (cached) {
    if (
      isStateSame(cached.lastStateArgs, state, ctx) &&
      isCardSame(cached.lastCardArgs, card, idx)
    ) {
      return cached.viewModel;
    }
  }

  const vm = createCardViewModel(card, idx, ctx, state);
  const isBlue = ctx.owner === "first";

  const newEntry: CacheEntry = {
    viewModel: vm,
    lastStateArgs: {
      pp: isBlue ? state.players.first.pp : state.players.second.pp,
      turn: (isBlue && state.activePlayer === "first") || (!isBlue && state.activePlayer === "second"),
      activePlayer: state.activePlayer,
      rally: `${state.players.first.rally}|${state.players.second.rally}`,
      shadows: `${state.players.first.shadows}|${state.players.second.shadows}`,
      boardLens: `${state.players.first.board.length}|${state.players.second.board.length}`,
      targetId: state.pendingTargetEffect?.eff?.op ?? "",
    },
    lastCardArgs: buildCardArgs(card, idx),
  };

  vmCache.set(card, newEntry);
  return vm;
}
