// src/logic/core/pendingTarget/types.ts
// Types for pending target selection state

import type {
  Effect,
  Player,
  CardInstance,
} from "../../../core/types/index.js";

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

/** Ops with a targeted click handler (populated by targeted/index at load). */
const TARGETED_OP_REGISTRY = new Set<string>();
let targetedOpRegistryReady = false;

export function registerTargetedOpForGuard(op: string): void {
  TARGETED_OP_REGISTRY.add(op);
}

export function sealTargetedOpRegistry(): void {
  targetedOpRegistryReady = true;
}

export function hasTargetedOpHandler(op: string): boolean {
  return TARGETED_OP_REGISTRY.has(op);
}

export function isTargetedOpRegistryReady(): boolean {
  return targetedOpRegistryReady;
}
