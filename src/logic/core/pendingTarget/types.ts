// src/logic/core/pendingTarget/types.ts
// Types for pending target selection state

import { Effect, Player, CardInstance } from "../../../core/types.js";

/**
 * Shape of a pending target selection request.
 * This matches the existing pendingTargetEffect structure.
 */
export interface PendingTargetRequest {
  eff: Effect;
  owner: Player;
  sourceCard: CardInstance | null;
  targets: CardInstance[];
  selectCount: number;
  pool: CardInstance[];
  resumeEffects?: Effect[];
  canTargetLeader?: boolean;

  // Allow additional properties for specialized ops
  [key: string]: any;
}

export type PendingTargetResult =
  | { status: "pending" }
  | { status: "resolved"; targets: CardInstance[] };
