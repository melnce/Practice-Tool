import type { CardInstance, GameState } from "../../core/types/index.js";
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
  phase: string;
  mulliganStage: string;
  rally: string;
  shadows: string;
  boardLens: string;
  targetId: string;
  targetUids: string;
};

type CardArgs = {
  cost: number;
  atk: number;
  def: number;
  buffs: string;
  selectable: boolean;
  targetSelected: boolean;
  mulligan: boolean;
  mulliganSelectable: boolean;
  attacked: boolean;
  evolved: boolean;
  counters: string;
  keywordsLen: number;
  kwStateHash: string;
  countdown: number;
  idx: number;
};

const vmCache = new WeakMap<CardInstance, CacheEntry>();

function isCardTargetSelected(card: CardInstance, state: GameState): boolean {
  const uids = state.pendingTargetEffect?.targetUids;
  return Array.isArray(uids) && uids.includes(card.uid);
}

function isStateSame(
  prev: StateArgs,
  state: GameState,
  ctx: ZoneContext,
): boolean {
  const isBlue = ctx.owner === "first";
  const pp = isBlue ? state.players.first.pp : state.players.second.pp;
  // Use activePlayer as source of truth
  const isFirstActive = state.activePlayer === "first";
  const isMyTurn = (isBlue && isFirstActive) || (!isBlue && !isFirstActive);

  if (prev.pp !== pp) return false;
  // We keep the old turn check but also enforce strict activePlayer check
  if (prev.turn !== isMyTurn) return false;
  if (prev.activePlayer !== state.activePlayer) return false;
  if (prev.phase !== state.phase) return false;
  if (prev.mulliganStage !== (state.mulliganStage ?? "")) return false;

  if (
    prev.boardLens !==
    `${state.players.first.board.length}|${state.players.second.board.length}`
  )
    return false;

  const targetOp = state.pendingTargetEffect?.eff?.op ?? "";
  if (prev.targetId !== targetOp) return false;

  const targetUids = (state.pendingTargetEffect?.targetUids ?? []).join(",");
  if (prev.targetUids !== targetUids) return false;

  if (
    prev.rally !== `${state.players.first.rally}|${state.players.second.rally}`
  )
    return false;
  if (
    prev.shadows !==
    `${state.players.first.shadows}|${state.players.second.shadows}`
  )
    return false;

  return true;
}

function isCardSame(
  prev: CardArgs,
  card: CardInstance,
  idx: number,
  state: GameState,
): boolean {
  // Index Check
  if (prev.idx !== idx) return false;

  // Primitive Checks
  if (prev.cost !== (card.cost ?? 0)) return false;
  if (prev.atk !== (card.attack ?? 0)) return false;
  if (prev.def !== (card.defense ?? 0)) return false;
  if (prev.selectable !== !!card.__uiSelectable) return false;
  if (prev.targetSelected !== isCardTargetSelected(card, state)) return false;
  if (prev.mulligan !== !!card.__mulliganSelected) return false;
  if (prev.mulliganSelectable !== !!card.__mulliganSelectable) return false;
  if (prev.attacked !== !!card.hasAttacked) return false;
  if (prev.evolved !== !!card.hasEvolved) return false;
  if (prev.countdown !== (card.countdown ?? -1)) return false;

  // Composite Checks
  const currBuffs = `${card.buffs?.attack ?? 0}|${card.buffs?.defense ?? 0}`;
  if (prev.buffs !== currBuffs) return false;

  // Keyword Checks
  if (prev.keywordsLen !== (card.keywords?.length ?? 0)) return false;

  const ks = card.keywordState || {};
  const ksHash = `${ks.engagedThisTurn ?? "f"}|${ks.cantAttack ?? "f"}|${ks.engageCost ?? ""}`;
  if (prev.kwStateHash !== ksHash) return false;

  // Counters
  const currCounters = card.counters ? JSON.stringify(card.counters) : "";
  if (prev.counters !== currCounters) return false;

  return true;
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
      isCardSame(cached.lastCardArgs, card, idx, state)
    ) {
      return cached.viewModel;
    }
  }

  const vm = createCardViewModel(card, idx, ctx, state);

  const isBlue = ctx.owner === "first";
  const ks = card.keywordState || {};

  const newEntry: CacheEntry = {
    viewModel: vm,
    lastStateArgs: {
      pp: isBlue ? state.players.first.pp : state.players.second.pp,
      // Use activePlayer as source of truth
      turn:
        (isBlue && state.activePlayer === "first") ||
        (!isBlue && state.activePlayer === "second"),
      activePlayer: state.activePlayer,
      phase: state.phase ?? "",
      mulliganStage: state.mulliganStage ?? "",
      rally: `${state.players.first.rally}|${state.players.second.rally}`,
      shadows: `${state.players.first.shadows}|${state.players.second.shadows}`,
      boardLens: `${state.players.first.board.length}|${state.players.second.board.length}`,
      targetId: state.pendingTargetEffect?.eff?.op ?? "",
      targetUids: (state.pendingTargetEffect?.targetUids ?? []).join(","),
    },
    lastCardArgs: {
      cost: Number(card.cost ?? 0),
      atk: Number(card.attack ?? 0),
      def: Number(card.defense ?? 0),
      buffs: `${card.buffs?.attack ?? 0}|${card.buffs?.defense ?? 0}`,
      selectable: !!card.__uiSelectable,
      targetSelected: isCardTargetSelected(card, state),
      mulligan: !!card.__mulliganSelected,
      mulliganSelectable: !!card.__mulliganSelectable,
      attacked: !!card.hasAttacked,
      evolved: !!card.hasEvolved,
      countdown: Number(card.countdown ?? -1),
      keywordsLen: card.keywords?.length ?? 0,
      kwStateHash: `${ks.engagedThisTurn ?? "f"}|${ks.cantAttack ?? "f"}|${ks.engageCost ?? ""}`,
      counters: card.counters ? JSON.stringify(card.counters) : "",
      idx,
    },
  };

  vmCache.set(card, newEntry);
  return vm;
}
