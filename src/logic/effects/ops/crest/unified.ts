// src/logic/effects/ops/crest/unified.ts
// Unified crest handler - replaces gain_crest, crest_add_counter, crest_pay_counter, destroy_crest, crest_advance_countdown

import { Effect, Player } from "../../../../core/types.js";
import { adapter } from "../../../../core/adapter.js";
import { logEvent } from "../../../../core/logger.js";
import {
  handleGainCrest,
  crestAddCounter,
  crestSpendCounter,
  removeCrest,
  crestAdvanceCountdown,
  crestIncreaseCountdown,
  completeCrest,
} from "../../crest.js";
import { runEffects } from "../../../core/effects/index.js";

export interface CrestHandlerContext {
  owner: Player;
  source?: any; // Optional: the crest object when in a crest trigger context
}

/**
 * Unified crest handler.
 * Routes to appropriate crest primitive based on action field.
 */
export function handleCrest(eff: Effect, ctx: CrestHandlerContext): void {
  const action = (eff as any).action;
  const name = (eff as any).name || (eff as any).crest || "Main";
  const target = (eff as any).target;

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
    case "advance_countdown": {
      const amount = (eff as any).amount ?? 1;
      // Support target: "self" for crest triggers
      if (
        target === "self" &&
        ctx.source &&
        Number.isFinite(ctx.source.countdown)
      ) {
        advanceCrestSelf(ctx.source, ctx.owner, amount);
      } else {
        crestAdvanceCountdown(ctx.owner, name, amount);
      }
      break;
    }
    case "increase_countdown": {
      // Player-global: increases countdown of ALL crests
      const amount = (eff as any).amount ?? 1;
      crestIncreaseCountdown(ctx.owner, amount);
      break;
    }
    case "destroy": {
      removeCrest(ctx.owner, name);
      break;
    }
    default:
      console.warn(`[crest] Unknown action: ${action}`);
  }
}

/**
 * Advance (reduce) countdown of the source crest itself.
 * Used when target: "self" in crest trigger context.
 */
function advanceCrestSelf(crest: any, owner: Player, amount: number): void {
  crest.countdown -= amount;
  logEvent("countdownChange", {
    card: crest.name,
    owner,
    value: crest.countdown,
  });

  if (crest.countdown <= 0) {
    completeCrest(crest, owner);
  } else {
    adapter.render();
  }
}
