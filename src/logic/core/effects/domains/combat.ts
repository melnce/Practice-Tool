import { registerOp } from "../registry.js";
import { handleDamage } from "../../../effects/ops/damage/unified.js";
import { handleDestroy } from "../../../effects/ops/destroy/index.js";
import { handleBanish } from "../../../effects/ops/banish/index.js";
import { handleRestore } from "../../../effects/ops/restore/index.js";

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
    // NOTE: leader_restored trigger fires from restoreLeaderHP primitive
    registerOp("restore", (eff, ctx) => {
        const restoreCtx = {
            ...((ctx.context as object) || {}),
            sourceCard: ctx.sourceCard,
            owner: ctx.owner,
        };
        handleRestore(eff, ctx.owner, ctx.queue, restoreCtx);
    });

    // ========================================================================
    // REMOVED: clash_damage
    // Now handled by unified damage op with target: "clash_opponent"
    // ========================================================================

    // ========================================================================
    // LEADER STATE EFFECTS - Now handled by unified ops with target: ally:leader / enemy:leader
    // - stat op: set defense (max HP)
    // - keyword op: Barrier, MaxDamageCap, Vulnerable
    // ========================================================================
}

import { COMBAT_OPS } from "./combatOps.js";
export const OPS = COMBAT_OPS;















