// src/logic/effects/ops/return/unified.ts
// Unified return handler - replaces return_to_hand, bounce, return_hand_to_deck

import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";
import { handleReturnToHand } from "../bounce.js";
import { handleReturnHandToDeck } from "../returnHandToDeck.js";

export interface ReturnHandlerContext {
  owner: Player;
  source: CardInstance | null;
  queue: any[];
  context?: any;
}

/**
 * Unified return handler.
 * Routes to appropriate return primitive based on destination field.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function handleReturn(
  eff: Effect,
  ctx: ReturnHandlerContext,
): string | void {
  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  if ((eff as any).destination === undefined) {
    throw new Error(
      `[return] Missing required field: "destination". Must be "hand" or "deck". Effect: ${JSON.stringify(eff)}`,
    );
  }
  if ((eff as any).target === undefined) {
    throw new Error(
      `[return] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const destination = (eff as any).destination;

  switch (destination) {
    case "hand":
      // Return card from board to hand (uses bounceToHand primitive)
      return handleReturnToHand(
        eff,
        ctx.owner,
        ctx.source,
        ctx.queue,
        ctx.context,
      );
    case "deck":
      // Return card from hand to deck
      return handleReturnHandToDeck(eff, ctx.owner, ctx.queue);
    default:
      throw new Error(
        `[return] Invalid destination: "${destination}". Must be "hand" or "deck".`,
      );
  }
}
