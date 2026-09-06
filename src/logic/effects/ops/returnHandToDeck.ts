// src/logic/effects/ops/returnHandToDeck.ts
import { state } from "../../../core/gameState.js";
import { shuffleInPlace } from "../../../core/utils.js";
import { logEvent } from "../../../core/logger.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../core/types/index.js";
import {
  trySetPendingTarget,
  reportSelectFizzled,
} from "../../core/pendingTarget/index.js";
import { highlightSelectable } from "../../core/targeting.js";
import { getHand, getDeck } from "../../../core/playerHelpers.js";
import { bumpZoneVersion } from "../../core/triggers/utils.js";

type PutBackOpts = { deferShuffle?: boolean; pendingDraws?: number };

function markDeferredShuffle(owner: Player) {
  const bag = (state as any)._deferredDeckShuffle as Set<Player> | undefined;
  if (bag) bag.add(owner);
  else (state as any)._deferredDeckShuffle = new Set<Player>([owner]);
}

/** Flush any deck shuffles deferred during return-then-draw chains. */
export function flushDeferredDeckShuffle(owner?: Player) {
  const bag = (state as any)._deferredDeckShuffle as Set<Player> | undefined;
  if (!bag?.size) return;
  const players = owner ? [owner] : [...bag];
  for (const p of players) {
    if (!bag.has(p)) continue;
    shuffleInPlace(getDeck(state, p));
    bag.delete(p);
  }
  if (!bag.size) delete (state as any)._deferredDeckShuffle;
}

/** Sum plain draw counts still queued after a return in the same chain. */
export function countPendingDraws(effectsQueue: any[] = []): number {
  let total = 0;
  for (const eff of effectsQueue) {
    if (!eff || eff.op !== "draw") continue;
    const count = (eff as any).count;
    if (count === "all" || count === "combo") continue;
    if (typeof count === "number" && Number.isFinite(count)) {
      total += Math.max(0, count);
      continue;
    }
    const parsed = parseInt(String(count ?? 1), 10);
    if (Number.isFinite(parsed)) total += Math.max(0, parsed);
  }
  return total;
}

function deferredInsertIndex(deckLength: number, pendingDraws: number): number {
  if (deckLength <= 0) return 0;
  if (pendingDraws <= 0) return state.rng.nextInt(deckLength);
  const maxIndex = Math.max(0, deckLength - pendingDraws);
  return state.rng.nextInt(maxIndex + 1);
}

function putBack(card: CardInstance, owner: Player, opts: PutBackOpts = {}) {
  const hand = getHand(state, owner);
  const deck = getDeck(state, owner);
  const idx = hand.indexOf(card);
  if (idx < 0) return false;
  const [removed] = hand.splice(idx, 1);
  if (!removed) return false;
  delete (removed as any).__uiSelectable;
  if (opts.deferShuffle) {
    // Owner ruling (deck op, shuffle:false): seeded random insertion below the
    // drawable top. When sibling draws follow, restrict to indices that keep the
    // top `pendingDraws` cards unchanged so returned cards cannot be redrawn
    // within the chain; full shuffle after the chain completes.
    const index = deferredInsertIndex(deck.length, opts.pendingDraws ?? 0);
    deck.splice(index, 0, removed);
    markDeferredShuffle(owner);
  } else {
    deck.push(removed);
    shuffleInPlace(deck);
  }
  bumpZoneVersion();
  return true;
}

function hasFollowingEffects(effectsQueue: any[] = []) {
  return Array.isArray(effectsQueue) && effectsQueue.length > 0;
}

/**
 * status: "blocked" | "pending" | "done"
 * effectsQueue is optional; when present we stash & clear it while waiting.
 */
export function handleReturnHandToDeck(
  eff: Effect,
  owner: Player,
  effectsQueue: any[] = [],
) {
  const hand = getHand(state, owner);
  const deferShuffle = hasFollowingEffects(effectsQueue);
  const pendingDraws = deferShuffle ? countPendingDraws(effectsQueue) : 0;
  const putBackOpts: PutBackOpts = { deferShuffle, pendingDraws };

  // Support returning the entire hand (e.g., Dimension Climb)
  const wantAll =
    (typeof (eff as any).select === "string" &&
      (eff as any).select.toLowerCase() === "all") ||
    (eff as any).all === true;

  if (wantAll) {
    const returnedCount = hand.length;
    // Return everything currently in hand
    while (hand.length) {
      const first = hand[0];
      if (!first) break;
      putBack(first, owner, putBackOpts);
    }
    (state as any).lastReturnedCount = returnedCount;
    logEvent("returnHandToDeckAll", { owner, count: returnedCount });
    return "done";
  }

  // If empty hand:
  if (hand.length === 0) {
    if ((eff as any).optional) {
      if ((eff as any).select) {
        reportSelectFizzled({
          eff,
          owner,
          sourceCard: null,
          target: String((eff as any).target || "ally:hand"),
        });
      }
      return "done";
    }
    console.warn("[return_hand_to_deck] no card to return — blocking chain");
    return "blocked";
  }

  const randomSelection =
    String((eff as any).select_mode || "").toLowerCase() === "random" ||
    String((eff as any).distribution || "").toLowerCase() === "random";
  if (randomSelection) {
    const requested =
      parseInt(
        String(
          (eff as any).select_count ??
            (eff as any).count ??
            (eff as any).select ??
            1,
        ),
        10,
      ) || 1;
    const bag = [...hand];
    const chosen: CardInstance[] = [];
    while (chosen.length < Math.min(requested, bag.length) && bag.length) {
      const index = state.rng.nextInt(bag.length);
      const card = bag.splice(index, 1)[0];
      if (card) chosen.push(card);
    }
    for (const card of chosen) putBack(card, owner, putBackOpts);
    (state as any).lastReturnedCount = chosen.length;
    logEvent("returnHandToDeckRandom", { owner, count: chosen.length });
    return "done";
  }

  if ((eff as any).select) {
    const selectCount =
      parseInt(
        String((eff as any).select ?? (eff as any).select_count ?? 1),
        10,
      ) || 1;
    logEvent("returnHandToDeck_select", {
      owner,
      pool: hand.length,
      select: selectCount,
    });
    const resume = effectsQueue ? Array.from(effectsQueue) : [];
    if (effectsQueue) effectsQueue.length = 0;
    const selection = trySetPendingTarget({
      eff,
      owner,
      sourceCard: null,
      resumeEffects: resume,
      pool: hand,
      targets: [],
      selectCount,
    });
    if (selection === "fizzled") {
      if (effectsQueue) effectsQueue.push(...resume);
      return "done";
    }
    highlightSelectable(hand);
    return "pending";
  }

  const first = hand[0];
  if (first) putBack(first, owner, putBackOpts);
  return "done";
}

export function resolveReturnHandToDeck(
  target: CardInstance,
  owner: Player,
  opts: PutBackOpts = {},
) {
  logEvent("returnHandToDeck", { owner, card: target.name, uid: target.uid });
  putBack(target, owner, opts);
}
