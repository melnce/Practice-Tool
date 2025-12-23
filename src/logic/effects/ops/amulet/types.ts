// src/logic/effects/ops/amulet/types.ts
// Amulet operation types - handles amulet countdown manipulation

export type AmuletAction = "reduce_countdown" | "increase_countdown";

export interface UnifiedAmuletSpec {
  op: "amulet";
  action: AmuletAction;
  amount?: number;
}
