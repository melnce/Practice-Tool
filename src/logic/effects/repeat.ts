// src/logic/effects/repeat.ts
import { state } from "../../core/gameState.js";
import { logEvent } from "../../core/logger.js";
import type { Effect, Player, CardInstance } from "../../core/types/index.js";
import {
  getHand,
  countCrests,
  getPlaysThisTurn,
} from "../../core/playerHelpers.js";

function repeatPayload(eff: Effect): Effect | Effect[] | null {
  if (Array.isArray((eff as any).effects) && (eff as any).effects.length) {
    return (eff as any).effects as Effect[];
  }
  if ((eff as any).effect) return (eff as any).effect as Effect;
  return null;
}

export function handleRepeatEffect(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
) {
  const payload = repeatPayload(eff);
  if (!payload || !effectsQueue) return;
  let count = 0;

  // Fixed count takes precedence when provided
  if (eff.count !== undefined && eff.count !== null && !eff.count_source) {
    count = Math.max(0, parseInt(String(eff.count), 10) || 0);
  } else {
    switch (eff.count_source) {
      case "count_in_hand":
        if (eff.filter?.tribe) {
          const hand = getHand(state, owner);
          count = hand.filter(
            (c) =>
              Array.isArray(c.tribes) && c.tribes.includes(eff.filter!.tribe!),
          ).length;
        }
        break;

      case "crest_count":
        count = countCrests(state, owner) | 0;
        break;

      case "combo":
        count = getPlaysThisTurn(state, owner);
        break;

      default:
        if (eff.count !== undefined) {
          count = Math.max(0, parseInt(String(eff.count), 10) || 0);
        } else {
          return;
        }
    }
  }

  if (count > 0) {
    logEvent("repeatExpand", { owner, count, source: sourceCard?.name });
  }

  const steps = Array.isArray(payload) ? payload : [payload];
  for (let i = 0; i < count; i++) {
    for (const step of steps) {
      effectsQueue.push(structuredClone(step));
    }
  }
}
