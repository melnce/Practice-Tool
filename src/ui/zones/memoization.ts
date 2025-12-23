import { CardInstance, GameState } from "../../core/types.js";
import { ZoneContext, CardViewModel } from "./types.js";
import { createCardViewModel } from "./viewModel.js";

interface CacheEntry {
  lastStateArgs: StateArgs;
  lastCardArgs: CardArgs;
  viewModel: CardViewModel;
}

type StateArgs = {
  pp: number;
  turn: boolean;
  activePlayer: string; // <-- Added this
  rally: string;
  shadows: string;
  boardLens: string;
  targetId: string;
};

type CardArgs = {
  cost: number;
  atk: number;
  def: number;
  buffs: string;
  selectable: boolean;
  mulligan: boolean;
  attacked: boolean;
  evolved: boolean;
  counters: string;
  keywordsLen: number;
  kwStateHash: string;
  countdown: number;
  idx: number;
};

const vmCache = new WeakMap<CardInstance, CacheEntry>();

function isStateSame(
  prev: StateArgs,
  state: GameState,
  ctx: ZoneContext,
): boolean {
  const isBlue = ctx.owner === "blue";
  const pp = isBlue ? state.bluePP : state.redPP;
  const isMyTurn =
    (isBlue && state.isBlueTurn) || (!isBlue && !state.isBlueTurn);

  if (prev.pp !== pp) return false;
  // We keep the old turn check but also enforce strict activePlayer check
  if (prev.turn !== isMyTurn) return false;
  if (prev.activePlayer !== state.activePlayer) return false;

  if (prev.boardLens !== `${state.blueBoard.length}|${state.redBoard.length}`)
    return false;

  const targetOp = state.pendingTargetEffect?.eff?.op ?? "";
  if (prev.targetId !== targetOp) return false;

  if (prev.rally !== `${state.blueRally}|${state.redRally}`) return false;
  if (prev.shadows !== `${state.blueShadows}|${state.redShadows}`) return false;

  return true;
}

function isCardSame(prev: CardArgs, card: CardInstance, idx: number): boolean {
  // Index Check
  if (prev.idx !== idx) return false;

  // Primitive Checks
  if (prev.cost !== (card.cost ?? 0)) return false;
  if (prev.atk !== (card.attack ?? 0)) return false;
  if (prev.def !== (card.defense ?? 0)) return false;
  if (prev.selectable !== !!card.__uiSelectable) return false;
  if (prev.mulligan !== !!card.__mulliganSelected) return false;
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
      isCardSame(cached.lastCardArgs, card, idx)
    ) {
      return cached.viewModel;
    }
  }

  const vm = createCardViewModel(card, idx, ctx, state);

  const isBlue = ctx.owner === "blue";
  const ks = card.keywordState || {};

  const newEntry: CacheEntry = {
    viewModel: vm,
    lastStateArgs: {
      pp: isBlue ? state.bluePP : state.redPP,
      turn: (isBlue && state.isBlueTurn) || (!isBlue && !state.isBlueTurn),
      activePlayer: state.activePlayer, // <-- Track this
      rally: `${state.blueRally}|${state.redRally}`,
      shadows: `${state.blueShadows}|${state.redShadows}`,
      boardLens: `${state.blueBoard.length}|${state.redBoard.length}`,
      targetId: state.pendingTargetEffect?.eff?.op ?? "",
    },
    lastCardArgs: {
      cost: Number(card.cost ?? 0),
      atk: Number(card.attack ?? 0),
      def: Number(card.defense ?? 0),
      buffs: `${card.buffs?.attack ?? 0}|${card.buffs?.defense ?? 0}`,
      selectable: !!card.__uiSelectable,
      mulligan: !!card.__mulliganSelected,
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
