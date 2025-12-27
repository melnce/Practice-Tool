import { registerOp } from "../registry.js";
import { handleDamage } from "../../../effects/ops/damage/unified.js";
import { handleDestroy } from "../../../effects/ops/destroy/index.js";
import { handleBanish } from "../../../effects/ops/banish/index.js";
import { handleRestore } from "../../../effects/ops/restore/index.js";

export function registerCombatEffects() {
    // Unified damage handler - the single canonical damage op
    // All damage effects use "op": "damage" with distribution/amount_source fields
    registerOp("damage", (eff, ctx) => {
        // Build damage context with variables from shared context
        const damageCtx: any = {
            ...((ctx.context as object) || {}),
            sourceCard: ctx.sourceCard,
            owner: ctx.owner,
        };
        const result = handleDamage(
            eff,
            ctx.owner,
            ctx.sourceCard,
            ctx.queue,
            damageCtx,
        );
        if (result === "pending") return "pending";
    });


    // Unified destroy handler - the single canonical destroy op
    // All destroy effects use "op": "destroy" with distribution/scope fields
    registerOp("destroy", (eff, ctx) => {
        // Ensure ctx.context exists for variable propagation
        if (!ctx.context) {
            (ctx as any).context = {};
        }

        const destroyCtx: any = {
            ...((ctx.context as object) || {}),
            sourceCard: ctx.sourceCard,
            owner: ctx.owner,
        };
        const result = handleDestroy(eff, ctx.owner, ctx.queue, destroyCtx);

        // Propagate variables back to shared context for cross-effect communication
        // This enables store_count_as to be read by subsequent effects (e.g., Skullfane)
        if (destroyCtx.variables) {
            const sharedCtx = ctx.context as any;
            if (!sharedCtx.variables) sharedCtx.variables = {};
            Object.assign(sharedCtx.variables, destroyCtx.variables);
        }

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















