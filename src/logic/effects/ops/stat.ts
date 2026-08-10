// src/logic/effects/ops/stat.ts
// Entry point for stat operation - delegates to orchestrator

import { handleStatOrchestrator } from "./stat/orchestrator.js";
import type {
  Effect,
  Player,
  CardInstance,
  EffectContext,
} from "../../../core/types/index.js";

/**
 * Unified stat handler.
 * Delegates to the orchestrator which handles:
 * - Special modes (combo_repeat, double)
 * - Special targets (self, leader, hand, last_added_to_hand)
 * - Pool-based targeting with selection
 *
 * See stat/README.md for full documentation.
 */
export function handleStat(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: EffectContext = {},
): "done" | "pending" | void {
  return handleStatOrchestrator(
    eff as any,
    owner,
    sourceCard,
    effectsQueue,
    context,
  );
}
