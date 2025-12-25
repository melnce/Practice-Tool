// src/logic/effects/ops/counter/unified.ts
// Unified counter handler - handles generic CardInstance.counters["key"] manipulation
// Also handles special game state counters like "combo"

import { state } from "../../../../core/gameState.js";
import { CardInstance, Effect, Player } from "../../../../core/types/index.js";
import { addCounter, spendCounter, setCounter } from "../../counters.js";
import { logEvent } from "../../../../core/logger.js";
import { getPlaysThisTurn, setPlaysThisTurn } from "../../../../core/playerHelpers.js";

export interface CounterHandlerContext {
  owner: Player;
  source: CardInstance | null;
}

/**
 * Unified counter handler.
 * Handles:
 * - Card-based counters: CardInstance.counters["key"]
 * - Game state counters: "combo" (first/second player playsThisTurn)
 */
export function handleCounter(eff: Effect, ctx: CounterHandlerContext): void {
  const action = (eff as any).action;
  const key = (eff as any).key;
  const amount = Number((eff as any).amount ?? 1);

  if (!key) {
    console.warn(`[counter] Missing key for action: ${action}`);
    return;
  }

  // ========================================================================
  // SPECIAL: Game state counters
  // ========================================================================
  if (key === "combo") {
    handleComboCounter(ctx.owner, action, amount);
    return;
  }

  // ========================================================================
  // STANDARD: Card-based counters
  // ========================================================================
  if (!ctx.source) {
    console.warn(`[counter] Missing source for card-based key: ${key}`);
    return;
  }

  switch (action) {
    case "add": {
      addCounter(ctx.source, key, amount);
      break;
    }
    case "spend": {
      spendCounter(ctx.source, key, amount);
      break;
    }
    case "set": {
      setCounter(ctx.source, key, amount);
      break;
    }
    default:
      console.warn(`[counter] Unknown action: ${action}`);
  }
}

// ============================================================================
// COMBO COUNTER - operates on game state
// ============================================================================
function handleComboCounter(
  owner: Player,
  action: string,
  amount: number,
): void {
  if (action === "add") {
    const newPlays = getPlaysThisTurn(state, owner) + amount;
    setPlaysThisTurn(state, owner, newPlays);
    logEvent("comboAdd", {
      owner,
      add: amount,
      plays: newPlays,
    });
  } else {
    console.warn(`[counter] Unsupported action for combo: ${action}`);
  }
}















