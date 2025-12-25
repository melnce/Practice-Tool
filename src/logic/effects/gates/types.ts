// src/logic/effects/gates/types.ts

import { Effect, Player, CardInstance } from "../../../core/types/index.js";

/**
 * Gate condition types - unified from 17 legacy gate ops.
 */
export type GateCondition =
  // Resource gates
  | "necromancy" // Necromancy: cost shadows
  | "overflow" // Overflow: 7+ PP
  | "earth_rite" // Earth Rite: consume sigils

  // Turn/state gates
  | "max_pp" // Current player max PP >= threshold
  | "both_max_pp" // Both players max PP >= threshold
  | "combo" // Cards played this turn >= count
  | "rally" // Total followers summoned >= count
  | "hand_count" // Cards in hand >= count
  | "spellboost_count" // Source card's spellboost count >= threshold

  // Evolution gates
  | "evolved_self" // Source card is evolved
  | "super_evolved_self" // Source card is super evolved
  | "evolved_allied" // Any allied follower is evolved
  | "super_evolved_allied" // Any allied follower is super evolved
  | "super_evo_unlocked" // Super evolution available (turn 6/7)

  // Board/card gates
  | "board_name" // Named card exists on board
  | "amulet_count" // Number of amulets >= count
  | "self_cost" // Source card's effective cost equals value

  // Special gates
  | "skybound_art" // Turn + evolves witnessed >= requirement
  | "no_ally_attacked" // No ally has attacked this turn
  | "highlander"; // No duplicate cards in deck

/**
 * Unified specification for all gate operations.
 * Replaces 17 legacy *_gate ops.
 */
export interface UnifiedGateSpec {
  op: "gate";

  /** The condition to check */
  condition: GateCondition;

  /** Threshold/count for count-based conditions */
  count?: number;

  /** Minimum value for max PP gates */
  at_least?: number;

  /** Cost for necromancy gate */
  cost?: number;

  /** Requirement for skybound art */
  requirement?: number;

  /** Named card for board_name gate */
  name?: string;

  /** Effects to run if condition passes */
  effects?: Effect[];

  /** Effects to run if condition fails */
  else_effects?: Effect[];
}

/**
 * Context for gate evaluation.
 */
export interface GateContext {
  owner: Player;
  sourceCard: CardInstance | null;
  queue: Effect[];
}

/**
 * Normalizes any gate effect (including legacy formats) into UnifiedGateSpec.
 */
export function normalizeToGateSpec(eff: Effect): UnifiedGateSpec {
  const legacyOp = eff.op as string;

  // Map legacy op names to condition types
  const conditionMap: Record<string, GateCondition> = {
    necromancy_gate: "necromancy",
    overflow_gate: "overflow",
    earth_rite: "earth_rite",
    max_pp_gate: "max_pp",
    both_max_pp_gate: "both_max_pp",
    combo_gate: "combo",
    rally_gate: "rally",
    hand_count_gate: "hand_count",
    evolved_self_gate: "evolved_self",
    super_evolved_self_gate: "super_evolved_self",
    evolved_allied_gate: "evolved_allied",
    super_evolved_allied_gate: "super_evolved_allied",
    super_evo_gate: "super_evo_unlocked",
    super_evolve_gate: "super_evo_unlocked",
    board_name_gate: "board_name",
    amulet_count_gate: "amulet_count",
    self_cost_gate: "self_cost",
    skybound_art_gate: "skybound_art",
    no_ally_attacked_this_turn_gate: "no_ally_attacked",
    no_duplicates_in_deck_gate: "highlander",
  };

  const condition =
    legacyOp === "gate"
      ? (eff as any).condition
      : conditionMap[legacyOp] || "unknown";

  const spec = {
    op: "gate" as const,
    condition: condition as GateCondition,
    effects: eff.effects ?? undefined,
    else_effects: (eff as any).else_effects ?? undefined,
  } as UnifiedGateSpec;

  // Copy relevant parameters
  if ((eff as any).count !== undefined)
    spec.count = parseInt((eff as any).count);
  if ((eff as any).at_least !== undefined)
    spec.at_least = parseInt((eff as any).at_least);
  if ((eff as any).cost !== undefined) spec.cost = parseInt((eff as any).cost);
  if ((eff as any).requirement !== undefined)
    spec.requirement = parseInt((eff as any).requirement);
  if ((eff as any).name !== undefined) spec.name = (eff as any).name;

  return spec;
}















