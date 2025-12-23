// src/logic/effects/ops/amulet/unified.ts
// Unified amulet handler - handles amulet countdown (instance-based targeting)

import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { adapter } from "../../../../core/adapter.js";
import { logEvent } from "../../../../core/logger.js";

export interface AmuletHandlerContext {
  owner: Player;
  source: CardInstance | null;
}

/**
 * Unified amulet handler.
 * Routes to appropriate amulet primitive based on action field.
 * Only handles amulet countdown - instance-based targeting via sourceCard.
 */
export function handleAmulet(eff: Effect, ctx: AmuletHandlerContext): void {
  const action = (eff as any).action;
  const amount = Number((eff as any).amount ?? 1);

  switch (action) {
    case "reduce_countdown": {
      if (!ctx.source) return;
      reduceAmuletCountdown(ctx.source, amount);
      break;
    }
    case "increase_countdown": {
      if (!ctx.source) return;
      increaseAmuletCountdown(ctx.source, amount);
      break;
    }
    default:
      console.warn(`[amulet] Unknown action: ${action}`);
  }
}

/**
 * Reduce amulet countdown by amount.
 * Only works on Amulets with hasCountdown.
 */
function reduceAmuletCountdown(card: CardInstance, amount: number): void {
  if (card.type !== "Amulet" || !card.hasCountdown) return;

  card.countdown = Math.max(0, (Number(card.countdown) || 0) - amount);

  logEvent("countdownChange", {
    card: card.name,
    owner: card.owner,
    value: card.countdown,
  });

  adapter.render();
}

/**
 * Increase amulet countdown by amount.
 * Only works on Amulets with hasCountdown.
 */
function increaseAmuletCountdown(card: CardInstance, amount: number): void {
  if (card.type !== "Amulet" || !card.hasCountdown) return;

  card.countdown = (Number(card.countdown) || 0) + amount;

  logEvent("countdownChange", {
    card: card.name,
    owner: card.owner,
    value: card.countdown,
  });

  adapter.render();
}
