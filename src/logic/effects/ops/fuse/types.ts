// src/logic/effects/ops/fuse/types.ts
// Unified fuse operation types

import { Effect, Player, CardInstance } from "../../../../core/types.js";

/**
 * Action field values for unified fuse op
 * - start: Opens fuse partner selection UI
 * - finalize: Completes fuse with selected partners
 */
export type FuseAction = "start" | "finalize";

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
  | "gardens_allure"; // Forestcraft Gardens Allure

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
