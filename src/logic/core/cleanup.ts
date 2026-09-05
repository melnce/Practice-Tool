// src/logic/core/cleanup.ts
import { state } from "../../core/gameState.js";
import { moveToBanishZone } from "../effects/ops/banish/primitives.js";
import { logEvent } from "../../core/logger.js";
import { isGameOver, logEffectsHaltedGameOver } from "../../core/gameOver.js";
import { fireTrigger } from "./triggers.js";
import type { CardInstance, Player, Effect } from "../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "./triggers/types.js";
import {
  opponentOf,
  getBoard,
  getGraveyard,
  addShadows,
} from "../../core/playerHelpers.js";
import { bumpZoneVersion } from "./triggers/utils.js";
import { recordDestroyed } from "./destroyedHistory.js";

let runEffects: (
  effects: Effect[],
  owner: Player,
  source: any,
  context?: any,
) => "pending" | void;
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
    return (
      ((a.card as any).insertionTs ?? 0) - ((b.card as any).insertionTs ?? 0)
    );
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

function dispatchLeaveTriggers(
  owner: Player,
  card: CardInstance,
  defer: boolean,
) {
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

function triggerLastWords(card: CardInstance, owner: Player): "pending" | void {
  if ((card as any)._lwFired) return;
  if (!card?.hasLastWords) return;
  const kw = card.keywordState;
  const lw = kw?.lastWordsEffects || card.lastWordsEffects;
  if (!Array.isArray(lw)) return;
  if (!runEffects) {
    console.warn("cleanupDead: runEffects not registered!");
    return;
  }
  const result = runEffects(lw, owner, card);
  if (result === "pending" || state.pendingTargetEffect) {
    return "pending";
  }
  (card as any)._lwFired = true;
}

/**
 * Detach a card from a board array by object identity.
 * Must not use a previously collected index — destroy triggers / nested
 * cleanup can compact or reorder the board before we write the hole.
 * Null placeholders keep slot positions for LW summons (pushToBoard).
 */
function detachFromBoardAsNull(
  board: CardInstance[],
  card: CardInstance,
): boolean {
  let found = false;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === card) {
      (board as any)[i] = null;
      found = true;
    }
  }
  return found;
}

/**
 * Move a destroyed card into the graveyard. Enforces single-zone: if the
 * instance is still listed on the owner's board (stale slot), detach it.
 */
function sendToGrave(card: CardInstance, owner: Player) {
  detachFromBoardAsNull(getBoard(state, owner), card);
  const grave = getGraveyard(state, owner);
  if (grave.includes(card)) {
    card.zone = "graveyard";
    return;
  }
  card.zone = "graveyard";
  card.cost_mod = 0;
  grave.push(card);
  addShadows(state, owner, 1);
}

/** Flush deferred leave triggers + Last Words after an atomic card effect (C4). */
export function flushDeferredDeathBatch() {
  const MAX_ROUNDS = 32;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (isGameOver()) {
      const q = getDeferredQueues();
      logEffectsHaltedGameOver(q.leave.length + q.lw.length);
      q.leave.length = 0;
      q.lw.length = 0;
      return;
    }

    const q = getDeferredQueues();
    if (q.leave.length === 0 && q.lw.length === 0) break;

    if (q.leave.length > 0) {
      sortLeaveQueue(q.leave);
      while (q.leave.length > 0) {
        if (isGameOver()) {
          logEffectsHaltedGameOver(q.leave.length + q.lw.length);
          q.leave.length = 0;
          q.lw.length = 0;
          return;
        }
        const item = q.leave.shift()!;
        fireTrigger(item.event, item.activePlayer, item.context);
      }
    }

    const lwBatch = q.lw.splice(0);
    if (lwBatch.length > 0) {
      sortLwQueue(lwBatch);
      for (let i = 0; i < lwBatch.length; i++) {
        if (isGameOver()) {
          logEffectsHaltedGameOver(lwBatch.length - i + q.lw.length);
          q.lw.length = 0;
          return;
        }
        const { card: c, owner } = lwBatch[i]!;
        const paused = triggerLastWords(c, owner);
        if (paused === "pending" || state.pendingTargetEffect) {
          q.lw.unshift(...lwBatch.slice(i));
          if (state.pendingTargetEffect) {
            state.pendingTargetEffect.deferredLwComplete = {
              cardUid: c.uid,
              owner,
            };
          }
          compactAllBoards();
          return;
        }
        sendToGrave(c, owner);
      }
    }

    cleanupDead();

    if (q.leave.length === 0 && q.lw.length === 0) break;
  }

  compactAllBoards();
}

/** Finish a deferred LW that paused mid-flush for interactive selection. */
export function completeDeferredLwAfterSelection(request?: {
  cardUid: string;
  owner: Player;
}): void {
  if (!request) return;
  const q = getDeferredQueues();
  const idx = q.lw.findIndex((item) => item.card.uid === request.cardUid);
  if (idx < 0) return;
  const { card, owner } = q.lw.splice(idx, 1)[0]!;
  (card as any)._lwFired = true;
  sendToGrave(card, owner);
}

/** Resume deferred death flush after interactive LW/target resolution completes. */
export function resumeDeferredDeathIfIdle(): void {
  if (state.pendingTargetEffect) return;
  const q = getDeferredQueues();
  if (q.leave.length === 0 && q.lw.length === 0) return;
  flushDeferredDeathBatch();
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
    const { card: c, owner, board, isFollower, defLE0, kw } = death;
    const cardType = c.type;
    const isAmulet = c.type === "Amulet";

    const cause = defLE0
      ? "defense<=0"
      : c.type === "Amulet"
        ? "countdown==0"
        : "unknown";
    logEvent("destroyQueued", {
      card: c.name,
      owner,
      type: cardType,
      cause,
      uid: c.uid,
    });

    // Zone transfer FIRST (by identity, not collected index). Destroy/leave
    // triggers and nested cleanup may reorder the board; a stale index would
    // null the wrong slot (or extend the array) and leave the instance in
    // two zones when sendToGrave runs. Matches destroyTarget / bounce:
    // remove from the source zone, then fire observers.
    const isBanishedOnDeath = kw?.banishOnDeath || (c as any).banishOnDeath;
    detachFromBoardAsNull(board, c);

    delete (c as any).buffs;
    delete (c as any).potential_attack;
    delete (c as any).potential_defense;
    delete (c as any)._death_snapshot;

    if (isBanishedOnDeath) {
      logEvent("banishOnDeath", { card: c.name, owner });
      bumpZoneVersion();
      fireTrigger("ally_follower_leaves_field", owner as any);
      fireTrigger("enemy_follower_leaves_field", opponentOf(owner) as any);
      logEvent("banish", {
        card: c.name,
        uid: c.uid,
        owner,
        reason: "death",
      });
      moveToBanishZone(c, owner);
      continue;
    }

    logEvent("death", { card: c.name, owner, uid: c.uid });
    recordDestroyed(state, owner, c);

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
    } else if (isAmulet) {
      if (defer) {
        getDeferredQueues().leave.push({
          event: "ally_amulet_destroyed",
          activePlayer: owner,
          context: {
            destroyedCard: c,
            leavingCard: c,
            leavingOwner: owner,
          },
        });
      } else {
        fireTrigger("ally_amulet_destroyed", owner as any, {
          destroyedCard: c,
          leavingCard: c,
          leavingOwner: owner,
        });
      }
    }

    // Re-detach after triggers: nested effects must not re-seat the corpse.
    detachFromBoardAsNull(board, c);

    const lw = kw?.lastWordsEffects || c.lastWordsEffects;
    const lwCount = Array.isArray(lw) ? lw.length : 0;
    if (lwCount > 0) {
      logEvent("lastWords", {
        card: c.name,
        owner,
        count: lwCount,
        uid: c.uid,
      });
      lwQueue.push({ card: c, owner });
    } else {
      sendToGrave(c, owner);
    }
  }

  if (!defer) {
    sortLwQueue(lwQueue);
    for (let i = 0; i < lwQueue.length; i++) {
      const { card: c, owner } = lwQueue[i]!;
      const paused = triggerLastWords(c, owner);
      if (paused === "pending" || state.pendingTargetEffect) {
        getDeferredQueues().lw.push(...lwQueue.slice(i));
        return;
      }
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
