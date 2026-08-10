// src/logic/effects/ops/counter/types.ts
// Unified counter operation types
// NOTE: Countdown operations (reduce_countdown, delay_countdown) are handled by countdown/unified.ts, NOT counter

export type CounterAction = "add" | "spend" | "set";

export interface UnifiedCounterSpec {
  op: "counter";
  action: CounterAction;
  key: string; // Counter key - e.g. "earth", "combo", "faith"
  amount?: number;
}

/**
 * Normalize legacy counter ops to unified format.
 * NOTE: Only handles counter ops. Countdown ops are in countdown/types.ts
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
    case "spend_counter":
      return {
        op: "counter",
        action: "spend",
        key: eff.key,
        amount: eff.amount ?? 1,
      };
    case "set_counter":
      return {
        op: "counter",
        action: "set",
        key: eff.key,
        amount: eff.amount ?? 0,
      };
    case "counter":
      return eff as UnifiedCounterSpec;
    default:
      throw new Error(`Unknown counter op: ${eff.op}`);
  }
}
