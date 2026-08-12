// src/logic/effects/ops/crest/types.ts
// Unified crest operation types

export type CrestAction =
  | "gain"
  | "add_counter"
  | "pay_counter"
  | "append_triggers"
  | "advance_countdown"
  | "destroy"
  | "banish_all";

export interface UnifiedCrestSpec {
  op: "crest";
  action: CrestAction;
  name?: string; // Crest name
  crest?: string; // Alias for name

  // For "gain" action
  image?: string;
  description?: string;
  countdown?: number;
  effects?: any[];
  triggers?: any[];
  trigger?: any; // Legacy single trigger support
  player?: string; // "opponent" to give to opponent

  // For counter actions
  counter?: string; // Counter key (e.g., "faith")
  amount?: number;

  // For "pay_counter" action
  on_success_effects?: any[];

  // For "append_triggers" action — additive triggers on an existing crest
  // (e.g. Eld Faith payoffs after a successful pay_counter).
  append_triggers?: any[];
}

/**
 * Normalize legacy crest ops to unified format.
 * NOTE: For reference during migration.
 */
export function normalizeToCrestSpec(eff: any): UnifiedCrestSpec {
  const name = eff.name || eff.crest;

  switch (eff.op) {
    case "gain_crest":
      return {
        op: "crest",
        action: "gain",
        name,
        image: eff.image,
        description: eff.description,
        countdown: eff.countdown,
        effects: eff.effects,
        triggers: eff.triggers,
        trigger: eff.trigger,
        player: eff.player,
      };
    case "crest_add_counter":
      return {
        op: "crest",
        action: "add_counter",
        name,
        counter: eff.counter,
        amount: eff.amount,
      };
    case "crest_pay_counter":
      return {
        op: "crest",
        action: "pay_counter",
        name,
        counter: eff.counter,
        amount: eff.amount,
        on_success_effects: eff.on_success_effects,
      };
    case "destroy_crest":
      return {
        op: "crest",
        action: "destroy",
        name,
      };
    case "crest_advance_countdown":
      return {
        op: "crest",
        action: "advance_countdown",
        name,
        amount: eff.amount,
      };
    case "crest":
      return eff as UnifiedCrestSpec;
    default:
      throw new Error(`Unknown crest op: ${eff.op}`);
  }
}
