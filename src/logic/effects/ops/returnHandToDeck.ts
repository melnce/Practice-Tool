// src/logic/effects/ops/returnHandToDeck.ts
import { state } from "../../../core/gameState.js";
import { shuffleInPlace } from "../../../core/utils.js";
import { logEvent } from "../../../core/logger.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../core/types/index.js";
import { setPendingTarget } from "../../core/pendingTarget/index.js";
import { getHand, getDeck } from "../../../core/playerHelpers.js";

function putBack(card: CardInstance, owner: Player) {
  const hand = getHand(state, owner);
  const deck = getDeck(state, owner);
  const idx = hand.indexOf(card);
  if (idx < 0) return false;
  const [removed] = hand.splice(idx, 1);
  if (!removed) return false;
  deck.push(removed);
  shuffleInPlace(deck);
  return true;
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

  // Support returning the entire hand (e.g., Dimension Climb)
  const wantAll =
    (typeof (eff as any).select === "string" &&
      (eff as any).select.toLowerCase() === "all") ||
    (eff as any).all === true;

  if (wantAll) {
    const returnedCount = hand.length;
    // Return everything currently in hand
    while (hand.length) {
      // putBack shuffles each time; that's fine, or replace with a single shuffle if you prefer
      const first = hand[0];
      if (!first) break;
      putBack(first, owner);
    }
    (state as any).lastReturnedCount = returnedCount;
    logEvent("returnHandToDeckAll", { owner, count: returnedCount });
    // Render removed - UI layer
    return "done";
  }

  // If empty hand:
  if (hand.length === 0) {
    if ((eff as any).optional) {
      // optional bounce: do nothing and keep resolving
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
    for (const card of chosen) putBack(card, owner);
    (state as any).lastReturnedCount = chosen.length;
    logEvent("returnHandToDeckRandom", { owner, count: chosen.length });
    return "done";
  }

  if ((eff as any).select) {
    // Canonical `select` wins; `select_count` is legacy fallback only.
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
    setPendingTarget({
      eff,
      owner,
      sourceCard: null,
      resumeEffects: resume,
      pool: hand, // <-- Add this (the pool is the hand)
      targets: [], // <-- Add this
      selectCount,
    });
    hand.forEach((c) => ((c as any).__uiSelectable = true)); // This is effectively highlightSelectable(pool)
    // Render removed - UI layer
    return "pending";
  }

  // no-select fallback
  const first = hand[0];
  if (first) putBack(first, owner);
  // Render removed - UI layer
  return "done";
}

export function resolveReturnHandToDeck(target: CardInstance, owner: Player) {
  logEvent("returnHandToDeck", { owner, card: target.name, uid: target.uid });
  putBack(target, owner);
}
