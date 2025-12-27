import { registerOp } from "../registry.js";
import { handleSummon } from "../../../effects/ops/summon/index.js";
import { handleReturn } from "../../../effects/ops/return/unified.js";
import { handleTransform } from "../../../effects/ops/transform.js";

export function registerBoardEffects() {
  // ========================================================================
  // UNIFIED SUMMON - single entry point for all summon variants
  // ========================================================================
  registerOp("summon", (eff, ctx) => {
    console.log("[SUMMON DEBUG] summon op called", { eff, owner: ctx.owner });
    const summonCtx = {
      owner: ctx.owner,
      sourceCard: ctx.sourceCard,
      targets: (ctx.context as any)?.targets || [],
      targetUids: (ctx.context as any)?.targetUids || [],
      ...((ctx.context as object) || {}),
    };
    handleSummon(eff, ctx.owner, ctx.queue, summonCtx);
  });

  // ========================================================================
  // SPECIALIZED OPS - Now routed through unified summon handler
  // Legacy ops (fill_board_chain_decay, select_hand_summon_artifact_copy,
  // select_hand_summon_artifact_copies_eot_destroy, summon_destroyed_amulet_highest_base_cost)
  // are now handled by unified summon with source/mode fields.
  // ========================================================================

  // ========================================================================
  // RETURN / BOUNCE / TRANSFORM
  // ========================================================================

  // ==========================================================================
  // UNIFIED RETURN - replaces return_to_hand, bounce, return_hand_to_deck
  // ==========================================================================
  registerOp("return", (eff, ctx) => {
    const result = handleReturn(eff as any, {
      owner: ctx.owner,
      source: ctx.sourceCard,
      queue: ctx.queue,
      context: ctx.context,
    });
    if (result === "pending") return "pending";
  });

  // ==========================================================================
  // UNIFIED TRANSFORM - replaces transform, transform_in_hand, transform_random_spell_in_hand, spellboost_transform
  // zone: "board" (default) = transform selected/targeted card on board
  // zone: "hand" = transform cards in hand (mode: filter | random_spell)
  // zone: "self" = transform the source card itself
  // ==========================================================================
  registerOp("transform", (eff, ctx) => {
    handleTransform(eff as any, ctx.owner, {
      sourceCard: ctx.sourceCard,
      context: ctx.context,
    });
  });

  // NOTE: "amulet" op removed - use "countdown" op instead
}

import { BOARD_OPS } from "./boardOps.js";
export const OPS = BOARD_OPS;















