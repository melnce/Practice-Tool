import { registerOp } from "../registry.js";
// import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../targeting.js";
import { setPendingTarget } from "../../pendingTarget/index.js";
import { handleStat } from "../../../effects/ops/stat.js";
import { handleKeyword } from "../../../effects/ops/keyword/unified.js";
import { handleCost } from "../../../effects/ops/cost/unified.js";
import { handleSpellboost } from "../../../effects/ops/spellboost/unified.js";
import { handleCounter } from "../../../effects/ops/counter/unified.js";
import { handleCountdown } from "../../../effects/ops/countdown/unified.js";
import { applyAttacksPerTurn } from "../../../effects/attacks.js";
import { getTargetingContext } from "../context.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import type { CardInstance } from "../../../../core/types/index.js";

// import { BuffEffect } from "../../../../core/types/index.js";

export function registerBuffEffects() {
  // Stats - unified stat handler covers give +X/+Y, set stats, buff_hand_*, combo_repeat, etc
  registerOp("stat", (eff, ctx) => {
    if (
      handleStat(
        eff,
        ctx.owner,
        ctx.sourceCard,
        ctx.queue,
        ctx.context as any,
      ) === "pending"
    )
      return "pending";
  });
  // Legacy combo_repeat_buff was removed - now handled by:
  // { op: "stat", mode: "combo_repeat", target: "...", attack: N, defense: N }

  registerOp("attacks_per_turn", (eff, ctx) =>
    applyAttacksPerTurn(eff as any, ctx.sourceCard),
  );

  // ==========================================================================
  // UNIFIED KEYWORD - replaces keyword, remove_keyword, remove_abilities, grant_trigger
  // ==========================================================================
  registerOp("keyword", (eff, ctx) => {
    const tCtx = getTargetingContext(ctx);
    const merged = {
      ...tCtx,
      sourceCard: ctx.sourceCard,
      targets: (ctx.context as any)?.targets,
      targetUids: (ctx.context as any)?.targetUids,
    };
    const opCtx = {
      ...merged,
      isTargetedEffect: !!(eff.select || eff.select_count),
    };

    let targets: CardInstance[] =
      merged.targets && merged.targets.length > 0 && !eff.target
        ? (merged.targets as CardInstance[])
        : getPool(
            eff.target || "",
            ctx.owner,
            ctx.sourceCard,
            eff.condition,
            opCtx,
          );

    const effTarget = String((eff as any).target || "").toLowerCase();
    if (
      !targets.length &&
      merged.targetUids?.length &&
      effTarget.startsWith("selected")
    ) {
      targets = resolveUids(merged.targetUids);
      if (effTarget === "selected:follower") {
        targets = targets.filter((c) => c?.type === "Follower");
      } else if (effTarget === "selected:amulet") {
        targets = targets.filter((c) => c?.type === "Amulet");
      }
    }

    // Apply filters if specified
    if ((eff as any).filters) {
      const filters = (eff as any).filters;
      targets = targets.filter((c: any) => {
        if (filters.class && c.class !== filters.class) return false;
        if (
          filters.type &&
          c.type?.toLowerCase() !== String(filters.type).toLowerCase()
        )
          return false;
        if (
          filters.tribe &&
          (!Array.isArray(c.tribes) || !c.tribes.includes(filters.tribe))
        )
          return false;
        return true;
      });
    }

    // Apply exclude_self if specified
    if ((eff as any).exclude_self && ctx.sourceCard) {
      targets = targets.filter((c: any) => c.uid !== ctx.sourceCard?.uid);
    }

    const res = handleKeyword(eff as any, {
      owner: ctx.owner,
      sourceCard: ctx.sourceCard,
      targets,
      effectsQueue: ctx.queue,
      isTargetedEffect: opCtx.isTargetedEffect,
    });

    if (res.kind === "request_target") {
      setPendingTarget({
        ...res.request,
        targets: [],
        targetUids: [],
      });
      highlightSelectable(res.request.pool);
      return "pending";
    }
  });

  // ==========================================================================
  // UNIFIED COST - replaces 6 legacy cost ops
  // ==========================================================================
  registerOp("cost", (eff, ctx) => {
    const costCtx = { ...(ctx.context || {}), queue: ctx.queue };
    const result = handleCost(eff as any, ctx.owner, ctx.sourceCard, costCtx);
    if (result === "pending") return "pending";
  });

  // ==========================================================================
  // UNIFIED COUNTER - replaces add_counter, reduce_countdown, delay_countdown
  // ==========================================================================
  registerOp("counter", (eff, ctx) => {
    handleCounter(eff as any, { owner: ctx.owner, source: ctx.sourceCard });
  });

  // ==========================================================================
  // UNIFIED SPELLBOOST - replaces 5 legacy spellboost ops
  // Note: spellboost_transform is now handled by unified transform op with zone: "hand"
  // ==========================================================================
  registerOp("spellboost", (eff, ctx) => {
    handleSpellboost(eff as any, ctx.owner, ctx.sourceCard, ctx.context);
  });

  // ==========================================================================
  // UNIFIED COUNTDOWN - handles amulet and crest countdown timers
  // Standalone op eliminating the amulet/crest redirect pattern
  // ==========================================================================
  registerOp("countdown", (eff, ctx) => {
    handleCountdown(eff as any, { owner: ctx.owner, source: ctx.sourceCard });
  });
}

import { BUFF_OPS } from "./buffsOps.js";
export const OPS = BUFF_OPS;
