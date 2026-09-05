// src/logic/effects/ops/fuse/types.ts
// Unified fuse operation types

import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";

/**
 * Action field values for unified fuse op
 * - start: Opens fuse partner selection UI
 * - finalize: Completes fuse with selected partners
 */
export type FuseAction = "start" | "finalize";

/** Allowed fuse.action values — must match handleFuse in fuse/unified.ts */
export const FUSE_ACTION_VALUES = new Set(["start", "finalize"]);

/**
 * Type field values for action: finalize
 * Determines which class-specific finalizer to use
 */
export type FuseType =
  | "generic" // Default transform/waste
  | "fortifier" // Portalcraft Fortifier
  | "alpha" // Portalcraft Ominous Artifact α
  | "gear_multi" // Portalcraft Gear of Ambition/Remembrance
  | "loot" // Swordcraft Loot
  | "gardens_allure" // Forestcraft Gardens Allure
  | "cards"; // Generic Fuse: Cards (any hand card)

/**
 * Unified fuse op interface
 *
 * Examples:
 * { "op": "fuse", "action": "start", "initiator_uid": "..." }
 * { "op": "fuse", "action": "finalize", "type": "generic", "initiator_uid": "...", "result": {...} }
 */
export type FuseOp = Effect & {
  op: "fuse";
  action: FuseAction;

  // For action: start
  initiator_uid?: string;

  // For action: finalize
  type?: FuseType;
  result?: any;
  result_name?: string;
  recipe_id?: string;
  recipe_index?: number;
};

export interface FuseContext {
  owner: Player;
  sourceCard: CardInstance | null;
  queue: any[];
  context: any;
}

// ============================================================================
// SHARED FUSE HELPERS - Consolidated from duplicate implementations
// ============================================================================

import { state } from "../../../../core/gameState.js";
import { getHand, getGraveyard } from "../../../../core/playerHelpers.js";
import { fireTrigger } from "../../../core/triggers.js";
import { isTargetedOpDispatchActive } from "../../../core/targeting/guards.js";
import type { TriggerContext } from "../../../core/triggers/types.js";

/** Check if this card already fused this turn */
export function alreadyFusedThisTurn(card: CardInstance | null): boolean {
  return !!card && card.lastFuseRound === state.roundCount;
}

/** Get player's hand */
export function handOf(owner: Player): CardInstance[] {
  return getHand(state, owner);
}

/** Get player's graveyard */
export function graveOf(owner: Player): CardInstance[] {
  return getGraveyard(state, owner);
}

/** True when card text is "Fuse: Cards" (any hand card may be fused). */
export function hasFuseCardsCapability(
  card: CardInstance | null | undefined,
): boolean {
  if (!card) return false;
  if ((card as any).fuse_capability === "cards") return true;
  const desc = String(card.description ?? "");
  return /(?:^|\n)Fuse:\s*Cards(?:\s|$)/m.test(desc);
}

/** Fire on_fuse now, or defer until targeted-op dispatch completes. */
export function emitOnFuse(owner: Player, context: TriggerContext): void {
  if (isTargetedOpDispatchActive()) {
    (state as any)._deferredOnFuse = { owner, context };
    return;
  }
  fireTrigger("on_fuse", owner, context);
}

/** Flush a deferred on_fuse queued during fuse finalize inside targeted dispatch. */
export function flushDeferredOnFuse(): void {
  const pending = (state as any)._deferredOnFuse as
    | { owner: Player; context: TriggerContext }
    | undefined;
  if (!pending) return;
  delete (state as any)._deferredOnFuse;
  fireTrigger("on_fuse", pending.owner, pending.context);
}
