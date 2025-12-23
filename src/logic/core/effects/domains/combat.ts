import { registerOp } from "../registry.js";
import { enqueueManyFront } from "../queue.js";
import { handleDamage } from "../../../effects/ops/damage/unified.js";
import { handleDestroy } from "../../../effects/ops/destroy/index.js";
import { handleBanish } from "../../../effects/ops/banish/index.js";
import { handleRestore } from "../../../effects/ops/restore/index.js";
// Leader ops (handleLeaderBarrierOp, handleSetMaxHP, etc.) are now handled by unified stat/keyword ops
import { cleanupDead } from "../../cleanup.js";

export function registerCombatEffects() {
  // Unified damage handler - the single canonical damage op
  // All damage effects use "op": "damage" with distribution/amount_source fields
  registerOp("damage", (eff, ctx) => {
    const result = handleDamage(
      eff,
      ctx.owner,
      ctx.sourceCard,
      ctx.queue,
      ctx.context as any,
    );
    if (result === "pending") return "pending";
  });

  // Unified destroy handler - the single canonical destroy op
  // All destroy effects use "op": "destroy" with distribution/scope fields
  registerOp("destroy", (eff, ctx) => {
    const destroyCtx = {
      ...((ctx.context as object) || {}),
      sourceCard: ctx.sourceCard,
      owner: ctx.owner,
    };
    const result = handleDestroy(eff, ctx.owner, ctx.queue, destroyCtx);
    if (result === "pending") return "pending";
  });

  // Unified banish handler - the single canonical banish op
  // All banish effects use "op": "banish" with distribution/scope fields
  registerOp("banish", (eff, ctx) => {
    const banishCtx = {
      ...((ctx.context as object) || {}),
      sourceCard: ctx.sourceCard,
      owner: ctx.owner,
    };
    const result = handleBanish(eff, ctx.owner, ctx.queue, banishCtx);
    if (result === "pending") return "pending";
  });

  // Unified restore handler - the single canonical restore/heal op
  // All restore effects use "op": "restore" with target/amount_source fields
  registerOp("restore", (eff, ctx) => {
    const restoreCtx = {
      ...((ctx.context as object) || {}),
      sourceCard: ctx.sourceCard,
      owner: ctx.owner,
    };
    handleRestore(eff, ctx.owner, ctx.queue, restoreCtx);

    // Crest processing for leader heal
    if (eff.target === "leader" || eff.target === "allies" || !eff.target) {
      void import("../../../effects/crest.js").then(({ processCrestEvent }) => {
        const targetOwner =
          (eff.player || "self") === "self"
            ? ctx.owner
            : ctx.owner === "blue"
              ? "red"
              : "blue";
        const fx = processCrestEvent(targetOwner, "heal_leader");
        if (fx.length) enqueueManyFront(ctx, fx);
      });
    }
  });

  registerOp("clash_damage", (eff, ctx) => {
    const attacker = (ctx.context as any)?.attacker;
    const defender = (ctx.context as any)?.defender;
    if (!attacker || !defender || !ctx.sourceCard) return;

    // Opponent is whoever is NOT the source card
    const opponent = ctx.sourceCard.uid === attacker.uid ? defender : attacker;

    void import("../../barrier.js").then(({ dealDamage }) => {
      dealDamage(opponent, Number(eff.amount || 0));
      cleanupDead();
    });
  });
  // ========================================================================
  // LEADER STATE EFFECTS - Now handled by unified ops with target: ally:leader / enemy:leader
  // - stat op: set defense (max HP)
  // - keyword op: Barrier, MaxDamageCap, Vulnerable
  // ========================================================================
}

import { COMBAT_OPS } from "./combatOps.js";
export const OPS = COMBAT_OPS;
