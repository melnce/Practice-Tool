// src/logic/effects/ops/crest/unified.ts
// Unified crest handler - handles crest operations

import type { Effect, Player } from "../../../../core/types/index.js";
import type { completeCrest, Crest } from "../../crest.js";

import { handleGainCrest, crestAddCounter, crestSpendCounter, destroyCrest } from "../../crest.js";
import { runEffects } from "../../../core/effects/index.js";
import { handleCountdown } from "../countdown/unified.js";

export interface CrestHandlerContext {
  owner: Player;
  source?: Crest | null; // Optional: the crest object when in a crest trigger context
}

/**
 * Unified crest handler.
 * Routes to appropriate crest primitive based on action field.
 * 
 * Countdown operations are delegated to the unified countdown handler.
 */
export function handleCrest(eff: Effect, ctx: CrestHandlerContext): void {
  const action = (eff as any).action;
  const name = (eff as any).name || (eff as any).crest || "Main";

  switch (action) {
    case "gain": {
      handleGainCrest(eff, ctx.owner);
      break;
    }
    case "add_counter": {
      const counter = (eff as any).counter || "faith";
      const amount = (eff as any).amount ?? 1;
      crestAddCounter(ctx.owner, name, counter, amount);
      break;
    }
    case "pay_counter": {
      const counter = (eff as any).counter || "faith";
      const amount = (eff as any).amount ?? 1;
      const ok = crestSpendCounter(ctx.owner, name, counter, amount);
      if (ok && Array.isArray((eff as any).on_success_effects)) {
        runEffects((eff as any).on_success_effects, ctx.owner, null);
      }
      break;
    }
    case "advance":
    case "advance_countdown":
    case "delay_countdown": {
      // Route to unified countdown handler
      handleCountdown(eff, { owner: ctx.owner, source: ctx.source });
      break;
    }
    case "destroy": {
      // Destroy crest - Last Words fires automatically if present
      destroyCrest(ctx.owner, name);
      break;
    }
    default:
      console.warn(`[crest] Unknown action: ${action}`);
  }
}















