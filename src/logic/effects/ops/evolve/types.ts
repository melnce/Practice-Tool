// src/logic/effects/ops/evolve/types.ts

import { Effect } from "../../../../core/types/index.js";

/**
 * Target for an evolve operation.
 */
export type EvolveTarget =
  | "self" // Source card
  | "selected" // Player-selected target (from context)
  | "last_summoned" // Cards in state.lastSummoned
  | "all_allies" // All allied unevolved followers
  | string; // Named card filter

/**
 * Mode for evolution.
 */
export type EvolveMode = "normal" | "super";

/**
 * Unified specification for all evolve operations.
 * Replaces 8 legacy evolve ops.
 */
export interface UnifiedEvolveSpec {
  op: "evolve";

  /** Target for evolution (defaults to "selected") */
  target?: EvolveTarget;

  /** Evolution mode: normal (+2/+2) or super (+3/+3) */
  mode?: EvolveMode;

  /** Named card filter for all_allies targeting */
  name?: string;

  /** Whether to spend evolution point (default: false for effect-triggered evolutions) */
  spend_point?: boolean;
}

/**
 * Normalizes any evolve effect (including legacy formats) into UnifiedEvolveSpec.
 */
export function normalizeToEvolveSpec(eff: Effect): UnifiedEvolveSpec {
  const legacyOp = eff.op as string;

  const spec: UnifiedEvolveSpec = {
    op: "evolve",
  };

  // Map legacy op names to target/mode
  switch (legacyOp) {
    case "evolve_self":
      spec.target = "self";
      break;
    case "super_evolve_self":
      spec.target = "self";
      spec.mode = "super";
      break;
    case "evolve":
      spec.target = (eff as any).target || "selected";
      break;
    case "evolve_last_summoned":
      spec.target = "last_summoned";
      break;
    case "evolve_all_unevolved_allies":
      spec.target = "all_allies";
      break;
    case "super_evolve_all_unevolved_allies":
      spec.target = "all_allies";
      spec.mode = "super";
      break;
    case "evolve_all_allies_named":
      spec.target = "all_allies";
      spec.name = (eff as any).name;
      break;
    case "super_evolve_ally":
      spec.target = "selected";
      spec.mode = "super";
      break;
    default:
      // Already unified format
      spec.target = (eff as any).target || "selected";
      spec.mode = (eff as any).mode;
      spec.name = (eff as any).name;
      spec.spend_point = (eff as any).spend_point;
  }

  // Copy remaining fields
  if ((eff as any).mode && !spec.mode) spec.mode = (eff as any).mode;
  if ((eff as any).spend_point !== undefined)
    spec.spend_point = (eff as any).spend_point;

  return spec;
}















