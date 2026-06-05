// src/logic/core/cleanup.ts
import { state } from "../../core/gameState.js";
import { banishCard } from "../effects/ops/banish/index.js";
import { logEvent } from "../../core/logger.js";
import { fireTrigger } from "./triggers.js";
import type { CardInstance, Player, Effect } from "../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "./triggers/types.js";
import {
  opponentOf,
  getBoard,
  getGraveyard,
  addShadows,
  getDestroyedHistory,
} from "../../core/playerHelpers.js";
import { bumpZoneVersion } from "./triggers/utils.js";

let runEffects: (
  effects: Effect[],
  owner: Player,
  source: any,
  context?: any,
) => void;
export function registerRunEffectsInCleanup(fn: any) {
  runEffects = fn;
}

type PendingDeath = {
  card: CardInstance;
  owner: Player;
  board: CardInstance[];
  index: number;
  isFollower: boolean;
  isAmulet: boolean;
  defLE0: boolean;
  kw: any;
};

type DeferredLeave = {
  event: TriggerEventName;
  activePlayer: Player;
  context: TriggerContext;
};

type DeferredDeathQueues = {
  lw: { card: CardInstance; owner: Player }[];
  leave: DeferredLeave[];
};

function getDeferredQueues(): DeferredDeathQueues {
  if (!(state as any)._deferredDeath) {
    (state as any)._deferredDeath = { lw: [], leave: [] };
  }
  return (state as any)._deferredDeath;
}

function clearDeferredQueues() {
  (state as any)._deferredDeath = { lw: [], leave: [] };
}

function sortLwQueue(queue: { card: CardInstance; owner: Player }[]) {
  const activePlayer = state.activePlayer;
  queue.sort((a, b) => {
    const aActive = a.owner === activePlayer ? 0 : 1;
    const bActive = b.owner === activePlayer ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return ((a.card as any).insertionTs ?? 0) - ((b.card as any).insertionTs ?? 0);
  });
}

/** Active-side leave observers (enemy leaving on your turn) resolve before reactive-side. */
function sortLeaveQueue(queue: DeferredLeave[]) {
  const activePlayer = state.activePlayer;
  queue.sort((a, b) => {
    const leavingA = a.context.leavingOwner;
    const leavingB = b.context.leavingOwner;
    const aActive = leavingA !== activePlayer ? 0 : 1;
    const bActive = leavingB !== activePlayer ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return 0;
  });
}

function dispatchLeaveTriggers(owner: Player, card: CardInstance, defer: boolean) {
  const opponent = opponentOf(owner);
  const allyCtx: TriggerContext = { leavingOwner: owner, leavingCard: card };
  const enemyCtx: TriggerContext = { leavingOwner: owner, leavingCard: card };

  if (defer) {
    const q = getDeferredQueues();
    q.leave.push({
      event: "ally_follower_leaves_field",
      activePlayer: owner,
      context: allyCtx,
    });
    // Listeners on the opponent's board use enemy_*; activePlayer is the leaving owner.
    q.leave.push({
      event: "enemy_follower_leaves_field",
      activePlayer: owner,
      context: enemyCtx,
    });
    return;
  }

  fireTrigger("ally_follower_leaves_field", owner as any, allyCtx);
  fireTrigger("enemy_follower_leaves_field", owner as any, enemyCtx);
}

function triggerLastWords(card: CardInstance, owner: Player) {
  if ((card as any)._lwFired) return;
  if (!card?.hasLastWords) return;
  const kw = card.keywordState;
  const lw = kw?.lastWordsEffects || card.lastWordsEffects;
  if (!Array.isArray(lw)) return;
  if (!runEffects) {
    console.warn("cleanupDead: runEffects not registered!");
    return;
  }
  (card as any)._lwFired = true;
  runEffects(lw, owner, card);
}

function sendToGrave(card: CardInstance, owner: Player) {
  card.zone = "graveyard";
  card.cost_mod = 0;
  getGraveyard(state, owner).push(card);
  addShadows(state, owner, 1);
}

/** Flush deferred leave triggers + Last Words after an atomic card effect (C4). */
export function flushDeferredDeathBatch() {
  const MAX_ROUNDS = 32;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const q = getDeferredQueues();
    if (q.leave.length === 0 && q.lw.length === 0) break;

    if (q.leave.length > 0) {
      sortLeaveQueue(q.leave);
      while (q.leave.length > 0) {
        const item = q.leave.shift()!;
        fireTrigger(item.event, item.activePlayer, item.context);
      }
    }

    const lwBatch = q.lw.splice(0);
    if (lwBatch.length > 0) {
      sortLwQueue(lwBatch);
      for (const { card: c, owner } of lwBatch) {
        triggerLastWords(c, owner);
        sendToGrave(c, owner);
      }
    }

    cleanupDead();

    if (q.leave.length === 0 && q.lw.length === 0) break;
  }

  compactAllBoards();
}

export function cleanupDead() {
  if (state.suppressCleanup) return;

  const defer = !!(state as any).deferDeathTriggers;

  const toNum = (v: any): number =>
    typeof v === "number" ? v : v == null ? 0 : +v;

  const needsCleanup = (board: CardInstance[]) => {
    for (let i = 0; i < board.length; i++) {
      const c = board[i];
      if (!c || typeof c !== "object") return true;
      if ((c as any).pendingDestruction) return true;
      if (c.type === "Follower" && toNum(c.defense) <= 0) return true;
      if (c.type === "Amulet" && c.hasCountdown && toNum(c.countdown) <= 0)
        return true;
    }
    return false;
  };

  const firstBoard = getBoard(state, "first");
  const secondBoard = getBoard(state, "second");
  if (!needsCleanup(firstBoard) && !needsCleanup(secondBoard)) {
    return;
  }

  const collectDeaths = (
    board: CardInstance[],
    owner: Player,
  ): PendingDeath[] => {
    const deaths: PendingDeath[] = [];
    for (let i = 0; i < board.length; i++) {
      const c = board[i];
      if (!c || typeof c !== "object") continue;

      const isFollower = c.type === "Follower";
      const isAmulet = c.type === "Amulet";
      const defVal = toNum(c.defense);
      const defLE0 = isFollower && defVal <= 0;
      const countdown0 = isAmulet && c.hasCountdown && toNum(c.countdown) <= 0;
      const markedForDeath = !!(c as any).pendingDestruction;
      const shouldDestroy = defLE0 || countdown0 || markedForDeath;
      if (!shouldDestroy) continue;

      deaths.push({
        card: c,
        owner,
        board,
        index: i,
        isFollower,
        isAmulet,
        defLE0,
        kw: c.keywordState,
      });
    }
    return deaths;
  };

  const allDeaths = [
    ...collectDeaths(firstBoard, "first"),
    ...collectDeaths(secondBoard, "second"),
  ];

  const lwQueue: { card: CardInstance; owner: Player }[] = defer
    ? getDeferredQueues().lw
    : [];

  for (const death of allDeaths) {
    const { card: c, owner, board, index, isFollower, defLE0, kw } = death;
    const cardType = c.type;

    const cause = defLE0
      ? "defense<=0"
      : c.type === "Amulet"
        ? "countdown==0"
        : "unknown";
    logEvent("destroyQueued", { card: c.name, owner, type: cardType, cause });

    if (isFollower) {
      dispatchLeaveTriggers(owner, c, defer);

      if (Array.isArray(c.tribes) && c.tribes.includes("Shikigami")) {
        if (owner === "first") {
          if (!state.players.first.shikigamiDeathsThisTurn)
            state.players.first.shikigamiDeathsThisTurn = [];
          state.players.first.shikigamiDeathsThisTurn.push(c);
        } else {
          if (!state.players.second.shikigamiDeathsThisTurn)
            state.players.second.shikigamiDeathsThisTurn = [];
          state.players.second.shikigamiDeathsThisTurn.push(c);
        }
      }

      const isBanishedOnDeathForWard =
        kw?.banishOnDeath || (c as any).banishOnDeath;
      if (defLE0 && c.hasWard && !isBanishedOnDeathForWard) {
        if (defer) {
          getDeferredQueues().leave.push({
            event: "ally_ward_destroyed",
            activePlayer: owner,
            context: { destroyedCard: c },
          });
        } else {
          fireTrigger("ally_ward_destroyed", owner as any, {
            destroyedCard: c,
          });
        }
      }
    }

    delete (c as any).buffs;
    delete (c as any).potential_attack;
    delete (c as any).potential_defense;
    delete (c as any)._death_snapshot;

    const isBanishedOnDeath = kw?.banishOnDeath || (c as any).banishOnDeath;
    if (isBanishedOnDeath) {
      logEvent("banishOnDeath", { card: c.name, owner });
      banishCard(c);
      if (board[index] === c) (board as any)[index] = null;
      continue;
    }

    logEvent("death", { card: c.name, owner });
    const gameTick =
      (state as any).gameTick ??
      ((state.roundCount || 0) * 1000 +
        (state.activePlayer === "first" ? 0 : 500));
    getDestroyedHistory(state, owner).push({
      uid: c.uid,
      name: c.name,
      type: cardType,
      cost: Number(c?.cost) || 0,
      base_image: c?.base_image || null,
      ts: gameTick,
      id: c.id,
    } as any);

    (board as any)[index] = null;

    const lw = kw?.lastWordsEffects || c.lastWordsEffects;
    const lwCount = Array.isArray(lw) ? lw.length : 0;
    if (lwCount > 0) {
      logEvent("lastWords", { card: c.name, owner, count: lwCount });
      lwQueue.push({ card: c, owner });
    } else {
      sendToGrave(c, owner);
    }
  }

  if (!defer) {
    sortLwQueue(lwQueue);
    for (const { card: c, owner } of lwQueue) {
      triggerLastWords(c, owner);
      sendToGrave(c, owner);
    }
    compactAllBoards();
  }
}

function compactAllBoards() {
  const compactBoard = (board: CardInstance[]) => {
    let w = 0;
    for (let r = 0; r < board.length; r++) {
      const x = board[r];
      if (x && typeof x === "object") {
        board[w++] = x;
      }
    }
    if (w < board.length) {
      board.length = w;
      bumpZoneVersion();
    }
  };
  compactBoard(getBoard(state, "first"));
  compactBoard(getBoard(state, "second"));
}

export function resetDeferredDeathState() {
  (state as any).deferDeathTriggers = false;
  clearDeferredQueues();
}

