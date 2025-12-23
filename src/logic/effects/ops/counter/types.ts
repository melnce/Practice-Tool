// src/logic/effects/ops/counter/types.ts
// Unified counter operation types

export type CounterAction = "add" | "reduce_countdown" | "increase_countdown";

export interface UnifiedCounterSpec {
  op: "counter";
  action: CounterAction;
  key?: string; // for "add" action - e.g. "earth"
  amount?: number;
}

/**
 * Normalize legacy counter ops to unified format.
 * NOTE: This is for reference during migration - not runtime normalization.
 */
export function normalizeToCounterSpec(eff: any): UnifiedCounterSpec {
  switch (eff.op) {
    case "add_counter":
      return {
        op: "counter",
        action: "add",
        key: eff.key,
        amount: eff.amount ?? 1,
      };
    case "reduce_countdown":
      return {
        op: "counter",
        action: "reduce_countdown",
        amount: eff.amount ?? 1,
      };
    case "increase_countdown":
      return {
        op: "counter",
        action: "increase_countdown",
        amount: eff.amount ?? 1,
      };
    case "counter":
      return eff as UnifiedCounterSpec;
    default:
      throw new Error(`Unknown counter op: ${eff.op}`);
  }
}
