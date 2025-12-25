// src/logic/core/pendingTarget/types.ts
// Types for pending target selection state

import { Effect, Player, CardInstance } from "../../../core/types/index.js";

/**
 * Shape of a pending target selection request.
 * Uses UID-only targeting for determinism and serialization.
 */
export interface PendingTargetRequest {
  eff: Effect;
  owner: Player;

  // Source card (kept for convenience)
  sourceCard: CardInstance | null;
  sourceCardUid?: string;

  // UID-based targeting (required)
  targetUids: string[];
  poolUids: string[];

  selectCount: number;
  resumeEffects?: Effect[];
  canTargetLeader?: boolean;

  // Allow additional properties for specialized ops
  [key: string]: any;
}

export type PendingTargetResult =
  | { status: "pending" }
  | { status: "resolved"; targetUids: string[] };















