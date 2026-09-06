// src/logic/core/cleanup.ts
import { state } from "../../core/gameState.js";
import { moveToBanishZone } from "../effects/ops/banish/primitives.js";
import { logEvent } from "../../core/logger.js";
import { isGameOver, logEffectsHaltedGameOver } from "../../core/gameOver.js";
import { fireTrigger, fireTriggerImmediate } from "./triggers.js";
import type { CardInstance, Player, Effect } from "../../core/types/index.js";
import type { TriggerContext } from "./triggers/types.js";
import {
  type DeathLeaveItem,
  type DeathLwItem,
  type ReactiveQueueItem,
  enqueueDeathLeaveGroup,
  enqueueDeathLwGroup,
  getResolutionQueue,
  clearResolutionQueue,
  resolveDeathLwCard,
  resolveDeathLeaveContext,
  resolveQueuedTriggerCard,
} from "./triggers/queue.js";
import {
  opponentOf,
  getBoard,
  getGraveyard,
  addShadows,
} from "../../core/playerHelpers.js";
import { bumpZoneVersion } from "./triggers/utils.js";
import { recordDestroyed } from "./destroyedHistory.js";
import { isDev, readEnv } from "../../core/env.js";
import { isEffectResolutionPaused } from "./resolutionPause.js";

let runEffects: (
  effects: Effect[],
  owner: Player,
  source: any,
  context?: any,
) => "pending" | void;
export function registerRunEffectsInCleanup(fn: any) {
  runEffects = fn;
}

/** Dev/test-only: peak nested flushDeferredDeathBatch depth (re-entry attempts). */
let maxResolutionDrainDepthForTests = 0;

export function resetResolutionDrainDepthForTests(): void {
  maxResolutionDrainDepthForTests = 0;
  (state as any).__resolutionDrainDepth = 0;
}

export function getResolutionDrainDepthForTests(): { max: number } {
  return { max: maxResolutionDrainDepthForTests };
}

function noteResolutionDrainDepthEntry(): void {
  const next = ((state as any).__resolutionDrainDepth ?? 0) + 1;
  (state as any).__resolutionDrainDepth = next;
  if (next > maxResolutionDrainDepthForTests) {
    maxResolutionDrainDepthForTests = next;
  }
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

function sortLwItems(queue: DeathLwItem[]) {
  const activePlayer = state.activePlayer;
  queue.sort((a, b) => {
    const aActive = a.owner === activePlayer ? 0 : 1;
    const bActive = b.owner === activePlayer ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aCard = resolveDeathLwCard(a);
    const bCard = resolveDeathLwCard(b);
    return (
      ((aCard as any)?.insertionTs ?? 0) - ((bCard as any)?.insertionTs ?? 0)
    );
  });
}

/** Active-side leave observers (enemy leaving on your turn) resolve before reactive-side. */
function sortLeaveItems(queue: DeathLeaveItem[]) {
  const activePlayer = state.activePlayer;
  queue.sort((a, b) => {
    const leavingA = a.leavingOwner;
    const leavingB = b.leavingOwner;
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
  leaveBatch: DeathLeaveItem[],
) {
  const allyCtx: TriggerContext = { leavingOwner: owner, leavingCard: card };
  const enemyCtx: TriggerContext = { leavingOwner: owner, leavingCard: card };

  if (defer) {
    leaveBatch.push({
      event: "ally_follower_leaves_field",
      activePlayer: owner,
      leavingCardUid: card.uid,
      leavingOwner: owner,
      context: allyCtx,
    });
    leaveBatch.push({
      event: "enemy_follower_leaves_field",
      activePlayer: owner,
      leavingCardUid: card.uid,
      leavingOwner: owner,
      context: enemyCtx,
    });
    return;
  }

  fireTrigger("ally_follower_leaves_field", owner as any, allyCtx);
  fireTrigger("enemy_follower_leaves_field", owner as any, enemyCtx);
}

function triggerLastWords(card: CardInstance, owner: Player): "pending" | void {
  if (isGameOver()) return;
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
  if (result === "pending" || isEffectResolutionPaused()) {
    return "pending";
  }
  (card as any)._lwFired = true;
}

/**
 * Remove a card from a board array by object identity.
 * Must not use a previously collected index — destroy triggers / nested
 * cleanup can reorder the board before we splice.
 */
function removeFromBoardByIdentity(
  board: CardInstance[],
  card: CardInstance,
): boolean {
  let found = false;
  for (let i = board.length - 1; i >= 0; i--) {
    if (board[i] === card) {
      board.splice(i, 1);
      found = true;
    }
  }
  if (found) bumpZoneVersion();
  return found;
}

/**
 * Move a destroyed card into the graveyard. Enforces single-zone: if the
 * instance is still listed on the owner's board (stale slot), detach it.
 */
function sendToGrave(card: CardInstance, owner: Player) {
  removeFromBoardByIdentity(getBoard(state, owner), card);
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

/**
 * Game-over halt: bury deferred corpses without firing leave/LW.
 * Used when the match ends mid-flush.
 */
function buryResolutionQueueWithoutTriggers(
  pendingLw: DeathLwItem[] = [],
): void {
  const q = getResolutionQueue();
  let dropped = pendingLw.length;
  for (const item of q) {
    if (item.kind === "death_leave") dropped += item.items.length;
    else if (item.kind === "death_lw") dropped += item.items.length;
    else if (item.kind === "reactive") dropped += item.entries.length;
  }
  logEffectsHaltedGameOver(dropped);

  const toBury = [...pendingLw];
  for (const item of q) {
    if (item.kind === "death_lw") toBury.push(...item.items);
  }
  clearResolutionQueue();

  for (const lwItem of toBury) {
    const card = resolveDeathLwCard(lwItem);
    if (!card) continue;
    (card as any)._lwFired = true;
    sendToGrave(card, lwItem.owner);
  }
}

function executeReactiveGroup(item: ReactiveQueueItem): "done" | "paused" {
  const start = item.resumeAt ?? 0;
  for (let i = start; i < item.entries.length; i++) {
    if (isGameOver()) return "done";
    const entry = item.entries[i]!;
    const sourceCard = resolveQueuedTriggerCard(entry);
    const result = runEffects(
      entry.trigger.effects || [],
      entry.owner,
      sourceCard,
      entry.context,
    );
    if (result === "pending" || isEffectResolutionPaused()) {
      item.resumeAt = i;
      if (state.pendingTargetEffect) {
        (state.pendingTargetEffect as any).deferredReactiveResume = {
          queueIndex: getResolutionQueue().indexOf(item),
        };
      }
      return "paused";
    }
  }
  delete item.resumeAt;
  return "done";
}

/** Flush unified resolution queue: reactive triggers + deferred death batches (C4). */
export function flushDeferredDeathBatch() {
  noteResolutionDrainDepthEntry();
  if ((state as any)._drainingResolutionQueue) {
    const vitest = readEnv("VITEST");
    const inTest = vitest === "true" || vitest === "1";
    if (isDev() || inTest) {
      throw new Error("[Triggers] Resolution drain re-entered");
    }
    return;
  }

  const MAX_ROUNDS = 32;
  const MAX_DRAIN_STEPS = 5000;
  let drainSteps = 0;
  let halted = false;
  let haltPendingLw: DeathLwItem[] = [];

  (state as any)._drainingResolutionQueue = true;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (isGameOver()) {
        halted = true;
        break;
      }

      const q = getResolutionQueue();
      if (q.length === 0) break;

      while (q.length > 0) {
        if (isGameOver()) {
          halted = true;
          break;
        }

        drainSteps++;
        if (drainSteps > MAX_DRAIN_STEPS) {
          const q = getResolutionQueue();
          const head = q[0];
          const kind = head?.kind ?? "unknown";
          const event =
            head?.kind === "reactive"
              ? head.event
              : head?.kind === "death_leave"
                ? head.items[0]?.event
                : head?.kind === "death_lw"
                  ? resolveDeathLwCard(head.items[0]!)?.name
                  : "unknown";
          throw new Error(
            `[Triggers] Resolution drain exceeded ${MAX_DRAIN_STEPS} steps. ` +
              `Queue length: ${q.length}. Head: ${kind}/${event}. ` +
              `This indicates an infinite loop in trigger effects.`,
          );
        }

        const item = q[0]!;

        if (item.kind === "death_leave") {
          q.shift();
          const batch = [...item.items];
          sortLeaveItems(batch);
          for (const leave of batch) {
            if (isGameOver()) {
              halted = true;
              break;
            }
            fireTriggerImmediate(
              leave.event,
              leave.activePlayer,
              resolveDeathLeaveContext(leave),
            );
          }
        } else if (item.kind === "death_lw") {
          q.shift();
          const lwBatch = [...item.items];
          sortLwItems(lwBatch);
          for (let i = 0; i < lwBatch.length; i++) {
            if (isGameOver()) {
              haltPendingLw = lwBatch.slice(i);
              halted = true;
              break;
            }
            const lwItem = lwBatch[i]!;
            const card = resolveDeathLwCard(lwItem);
            if (!card) continue;
            const owner = lwItem.owner;
            const paused = triggerLastWords(card, owner);
            if (paused === "pending" || isEffectResolutionPaused()) {
              enqueueDeathLwGroup(lwBatch.slice(i));
              if (state.pendingTargetEffect) {
                state.pendingTargetEffect.deferredLwComplete = {
                  cardUid: card.uid,
                  owner,
                };
              }
              return;
            }
            sendToGrave(card, owner);
          }
        } else {
          const status = executeReactiveGroup(item);
          if (status === "paused") {
            return;
          }
          q.shift();
        }

        if (halted) break;
        cleanupDead();
      }

      if (halted) break;
      if (getResolutionQueue().length === 0) break;
    }

    if (halted) {
      buryResolutionQueueWithoutTriggers(haltPendingLw);
      return;
    }
  } finally {
    (state as any)._drainingResolutionQueue = false;
    (state as any).__resolutionDrainDepth = 0;
  }
}

/** Finish a deferred LW that paused mid-flush for interactive selection. */
export function completeDeferredLwAfterSelection(request?: {
  cardUid: string;
  owner: Player;
}): void {
  if (!request) return;
  const q = getResolutionQueue();
  for (const item of q) {
    if (item.kind !== "death_lw") continue;
    const idx = item.items.findIndex((x) => x.cardUid === request.cardUid);
    if (idx < 0) continue;
    const resolved = resolveDeathLwCard(item.items[idx]!);
    if (!resolved) {
      item.items.splice(idx, 1);
      continue;
    }
    const owner = item.items[idx]!.owner;
    item.items.splice(idx, 1);
    (resolved as any)._lwFired = true;
    sendToGrave(resolved, owner);
    if (item.items.length === 0) {
      const qi = q.indexOf(item);
      if (qi >= 0) q.splice(qi, 1);
    }
    return;
  }
}

/** Resume unified resolution flush after interactive target/mode resolution completes. */
export function resumeDeferredDeathIfIdle(): void {
  if ((state as any)._drainingResolutionQueue) return;
  if (isEffectResolutionPaused()) return;
  if (getResolutionQueue().length === 0) return;
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

  const leaveBatch: DeathLeaveItem[] = [];
  const lwDefer: DeathLwItem[] = [];
  const lwSync: DeathLwItem[] = [];

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
    // remove the wrong slot and leave the instance in two zones when
    // sendToGrave runs. Matches destroyTarget / bounce: remove from the
    // source zone, then fire observers.
    const isBanishedOnDeath = kw?.banishOnDeath || (c as any).banishOnDeath;
    removeFromBoardByIdentity(board, c);

    delete (c as any).buffs;
    delete (c as any).potential_attack;
    delete (c as any).potential_defense;
    delete (c as any)._death_snapshot;

    if (isBanishedOnDeath) {
      logEvent("banishOnDeath", { card: c.name, owner });
      bumpZoneVersion();
      fireTrigger("ally_follower_leaves_field", owner as any);
      fireTrigger("enemy_follower_leaves_field", owner as any);
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
      dispatchLeaveTriggers(owner, c, defer, leaveBatch);

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
          leaveBatch.push({
            event: "ally_ward_destroyed",
            activePlayer: owner,
            leavingCardUid: c.uid,
            leavingOwner: owner,
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
        leaveBatch.push({
          event: "ally_amulet_destroyed",
          activePlayer: owner,
          leavingCardUid: c.uid,
          leavingOwner: owner,
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

    // Re-remove after triggers: nested effects must not re-seat the corpse.
    removeFromBoardByIdentity(board, c);

    const lw = kw?.lastWordsEffects || c.lastWordsEffects;
    const lwCount = Array.isArray(lw) ? lw.length : 0;
    if (lwCount > 0) {
      logEvent("lastWords", {
        card: c.name,
        owner,
        count: lwCount,
        uid: c.uid,
      });
      if (defer) {
        lwDefer.push({ cardUid: c.uid, owner, card: c });
      } else {
        lwSync.push({ cardUid: c.uid, owner, card: c });
      }
    } else {
      sendToGrave(c, owner);
    }
  }

  if (defer) {
    enqueueDeathLeaveGroup(leaveBatch);
    enqueueDeathLwGroup(lwDefer);
    return;
  }

  if (lwSync.length > 0) {
    sortLwItems(lwSync);
    for (let i = 0; i < lwSync.length; i++) {
      const { owner } = lwSync[i]!;
      const card = resolveDeathLwCard(lwSync[i]!);
      if (!card) continue;
      const paused = triggerLastWords(card, owner);
      if (paused === "pending" || isEffectResolutionPaused()) {
        enqueueDeathLwGroup(lwSync.slice(i));
        return;
      }
      sendToGrave(card, owner);
    }
  }
}

export function resetDeferredDeathState() {
  (state as any).deferDeathTriggers = false;
  clearResolutionQueue();
}
