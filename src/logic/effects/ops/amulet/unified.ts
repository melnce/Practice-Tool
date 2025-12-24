// src/logic/effects/ops/amulet/unified.ts
// Unified amulet handler - routes countdown to unified countdown handler

import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { handleCountdown } from "../countdown/unified.js";

export interface AmuletHandlerContext {
  owner: Player;
  source: CardInstance | null;
}

/**
 * Unified amulet handler.
 * Routes countdown actions to the unified countdown handler.
 */
export function handleAmulet(eff: Effect, ctx: AmuletHandlerContext): void {
  const action = (eff as any).action;

  switch (action) {
    case "advance_countdown":
    case "reduce_countdown":  // Legacy alias
    case "delay_countdown": {
      // Route to unified countdown handler
      handleCountdown(eff, { owner: ctx.owner, source: ctx.source });
      break;
    }
    default:
      console.warn(`[amulet] Unknown action: ${action}`);
  }
}















