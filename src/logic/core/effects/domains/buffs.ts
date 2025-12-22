
import { registerOp } from "../registry.js";
// import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../targeting.js";
import { setPendingTarget } from "../../pendingTarget/index.js";
import {
    handleBuff, handleBuffHandTribe, handleBuffLastAddedToHand,
    handleBuffHandClass, handleSetAttackTo, handleComboRepeatBuff, handleSetStats
} from "../../../effects/ops/buff.js";
import {
    handleBuffSelf, handleDynamicBuffSelf
} from "../../../effects/self.js";
import {
    handleKeyword, handleRemoveKeyword, handleRemoveAbilities
} from "../../keywords.js"; // in core
import {
    handleReduceCostSelf, handleReduceCost, handleSetCostSelf,
    applyTempOpponentHandCostMod, handleModifyCost, handleModifyCostPool
} from "../../../effects/cost.js";
import { handleAddCounter, handleReduceCountdown, handleIncreaseCountdown } from "../../../effects/counters.js";
import { applyAttacksPerTurn } from "../../../effects/attacks.js";
import { resolveDynamicValue } from "../../values.js";
import { spellboostHand, handleSetSpellboostCount } from "../../../effects/ops/spellboost.js";
import { getTargetingContext } from "../context.js";

// import { BuffEffect } from "../../../../core/types.js";

export function registerBuffEffects() {

    // Stats
    registerOp("buff", (eff, ctx) => {
        if (handleBuff(eff, ctx.owner, ctx.sourceCard, ctx.queue, ctx.context as any) === "pending") return "pending";
    });
    registerOp("buff_hand_class", (eff, ctx) => handleBuffHandClass(eff, ctx.owner));
    registerOp("buff_hand_tribe", (eff, ctx) => handleBuffHandTribe(eff, ctx.owner));
    registerOp("buff_last_added_to_hand", (eff, ctx) => handleBuffLastAddedToHand(eff, ctx.owner));
    registerOp("buff_self", (eff, ctx) => { if (ctx.sourceCard) handleBuffSelf(ctx.sourceCard, eff); });
    registerOp("dynamic_buff_self", (eff, ctx) => { if (ctx.sourceCard) handleDynamicBuffSelf(ctx.sourceCard, eff as any, ctx.owner); });
    registerOp("combo_repeat_buff", (eff, ctx) => {
        if (handleComboRepeatBuff(eff, ctx.owner, ctx.sourceCard, ctx.queue, ctx.context as any) === "pending") return "pending";
    });

    registerOp("set_stats", (eff, ctx) => {
        if (handleSetStats(eff, ctx.owner, ctx.sourceCard, ctx.queue, ctx.context as any) === "pending") return "pending";
    });
    registerOp("set_attack_to", (eff, ctx) => {
        if (handleSetAttackTo(eff, ctx.owner, ctx.sourceCard, ctx.queue, ctx.context as any) === "pending") return "pending";
    });

    registerOp("attacks_per_turn", (eff, ctx) => applyAttacksPerTurn(eff as any, ctx.sourceCard));

    // Keywords
    registerOp("keyword", (eff, ctx) => {

        // console.error("DEBUG_BUFFS: keyword op dispatched!");
        const tCtx = getTargetingContext(ctx);
        const merged = { ...tCtx, sourceCard: ctx.sourceCard, targets: (ctx.context as any)?.targets };
        // isTargetedEffect check logic
        const opCtx = { ...merged, isTargetedEffect: !!(eff.select || eff.select_count) };

        let targets = (merged.targets && merged.targets.length > 0 && !eff.target)
            ? merged.targets
            : getPool(eff.target || "", ctx.owner, ctx.sourceCard, eff.condition, opCtx);

        // Apply filters if specified (e.g., filters: { class: "Swordcraft" })
        if ((eff as any).filters) {
            const filters = (eff as any).filters;
            targets = targets.filter((c: any) => {
                if (filters.class && c.class !== filters.class) return false;
                if (filters.type && c.type?.toLowerCase() !== String(filters.type).toLowerCase()) return false;
                if (filters.tribe && (!Array.isArray(c.tribes) || !c.tribes.includes(filters.tribe))) return false;
                return true;
            });
        }

        // Apply exclude_self if specified
        if ((eff as any).exclude_self && ctx.sourceCard) {
            targets = targets.filter((c: any) => c.uid !== ctx.sourceCard?.uid);
        }

        const res = handleKeyword(eff, ctx.owner, ctx.queue, targets, merged);

        if (res.kind === "request_target") {
            setPendingTarget({
                ...res.request,
                targets: []
            });
            highlightSelectable(res.request.pool);
            return "pending";
        }
    });

    registerOp("remove_keyword", (eff, ctx) => {
        const targets = (ctx.context as any)?.targets || getPool(eff.target || "", ctx.owner);
        const res = handleRemoveKeyword(eff as any, ctx.owner, targets, ctx.queue);
        if (res.kind === "request_target") {
            setPendingTarget({ ...res.request, targets: [] });
            highlightSelectable(res.request.pool);
            return "pending";
        }
    });

    registerOp("remove_abilities", (eff, ctx) => {
        const opCtx = { ...(ctx.context as any), isTargetedEffect: !!eff.select };
        const targets = ((ctx.context as any).targets && (ctx.context as any).targets.length > 0 && !eff.target)
            ? (ctx.context as any).targets
            : getPool(eff.target || "", ctx.owner, ctx.sourceCard, eff.condition, opCtx);

        const res = handleRemoveAbilities(eff as any, ctx.owner, ctx.queue, targets, opCtx);
        if (res.kind === "request_target") {
            setPendingTarget({ ...res.request, targets: [] });
            highlightSelectable(res.request.pool);
            return "pending";
        }
    });

    registerOp("grant_trigger", (eff, ctx) => {
        const targets = ((ctx.context as any)?.targets && (ctx.context as any).targets.length) ? (ctx.context as any).targets : (ctx.sourceCard ? [ctx.sourceCard] : []);
        for (const t of targets) {
            if (!t || !eff.trigger) continue;
            if (!Array.isArray(t.triggers)) t.triggers = [];
            t.triggers.push(eff.trigger);
        }
    });

    // Cost / Counters
    registerOp("modify_cost", (eff, ctx) => handleModifyCost(eff, ctx.owner, ctx.sourceCard, ctx.context as any));
    registerOp("modify_cost_pool", (eff, ctx) => handleModifyCostPool(eff, ctx.owner, ctx.sourceCard));
    registerOp("reduce_cost", (eff, ctx) => {
        const target = (ctx.context && ((ctx.context as any).targetCard || (ctx.context as any).selectedCard)) || ctx.sourceCard;
        handleReduceCost(target!, eff);
    });
    registerOp("reduce_cost_self", (eff, ctx) => handleReduceCostSelf(ctx.sourceCard, eff));
    registerOp("set_cost_self", (eff, ctx) => handleSetCostSelf(ctx.sourceCard, eff));

    registerOp("increase_opponent_hand_cost_eot", (eff, ctx) => {
        const amt = parseInt(String(eff.amount ?? 1)) || 1;
        applyTempOpponentHandCostMod(ctx.owner, amt);
    });

    registerOp("add_counter", (eff, ctx) => handleAddCounter(eff, ctx.owner, ctx.sourceCard));
    registerOp("reduce_countdown", (eff, ctx) => handleReduceCountdown(ctx.sourceCard, eff));
    registerOp("increase_countdown", (eff, ctx) => {
        const amt = Number(eff.amount ?? 1);
        handleIncreaseCountdown(ctx.owner, amt);
    });

    // Spellboost
    registerOp("spellboost", (eff, ctx) => {
        spellboostHand(ctx.owner, (eff.count ?? eff.times ?? 1) as number);
    });
    registerOp("spellboost_hand", (eff, ctx) => {
        const countRaw = eff.count ?? eff.times ?? 1;
        const n = resolveDynamicValue(countRaw, { owner: ctx.owner, sourceCard: ctx.sourceCard });
        if (typeof countRaw === "string" && countRaw.includes("{self.")) {
            console.log(`[Spellboost] Dynamic count="${countRaw}" resolved to ${n}.`);
        }
        spellboostHand(ctx.owner, n);
    });
    registerOp("spellboost_target", (eff, ctx) => {
        if (ctx.sourceCard) spellboostHand(ctx.owner, 1, ctx.sourceCard);
    });
    registerOp("set_spellboost_count", (eff, ctx) => {
        if (ctx.sourceCard) handleSetSpellboostCount(eff, ctx.sourceCard);
    });
    registerOp("transform_self_if_spellboost_at_least", () => {
        // legacy no-op
    });

}

import { BUFF_OPS } from "./buffsOps.js";
export const OPS = BUFF_OPS;
