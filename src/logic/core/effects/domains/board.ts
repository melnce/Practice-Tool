
import { registerOp } from "../registry.js";
import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import {
    summonNamed, summonRandomFromDeck, handleSelectHandSummonArtifactCopiesEOT,
    handleSelectHandSummonArtifactCopy, summonExactCopy,
    handleSummonDestroyedAmuletHighestBaseCost, summonFromHand,
    handleFillCongregantCopies
} from "../../../effects/ops/summon.js";
import { handleReturnToHand } from "../../../effects/ops/bounce.js";
import { handleReturnHandToDeck } from "../../../effects/ops/returnHandToDeck.js";
import { handleReanimate } from "../../../effects/ops/reanimate.js";
import { transformTarget } from "../../../effects/ops/transform.js";
import { getPool } from "../../targeting.js"; // Targeting in core
import { getTargetingContext } from "../context.js";

const doLog = (event: string, payload: any) => logEvent(event, payload);

export function registerBoardEffects() {

    // Summon
    registerOp("summon", (eff, ctx) => {
        const tCtx = getTargetingContext(ctx);
        const target = (tCtx as any).selectedCard || (tCtx.targets && tCtx.targets[0]);
        const hand = ctx.owner === "blue" ? state.blueHand : state.redHand;
        if (target && hand.includes(target)) {
            summonFromHand(target, ctx.owner);
        } else {
            console.warn("op: summon called but no valid hand target found in context.");
        }
    });

    registerOp("summon_exact_copy", (eff, ctx) => {
        if (eff.target === "self" && ctx.sourceCard && ctx.sourceCard.type === "Follower") {
            summonExactCopy(ctx.sourceCard, ctx.owner);
            doLog("summon", { owner: ctx.owner, name: ctx.sourceCard.name });
            return;
        }

        const targets = ((ctx.context as any)?.targets && (ctx.context as any).targets.length)
            ? (ctx.context as any).targets
            : getPool(eff.target || "", ctx.owner, ctx.sourceCard, eff.condition, ctx.context as any);

        const times = Math.max(1, eff.count || 1);
        for (const t of targets) {
            if (t?.type !== "Follower") continue;
            for (let i = 0; i < times; i++) {
                summonExactCopy(t, ctx.owner);
                doLog("summon", { owner: ctx.owner, name: t.name });
            }
        }
    });

    registerOp("summon_named", (eff, ctx) => {
        summonNamed(eff, ctx.owner);
        doLog("summon", { owner: ctx.owner, name: eff.name });
    });
    registerOp("summon_named_enemy", (eff, ctx) => {
        const foe = ctx.owner === "blue" ? "red" : "blue";
        // op needs to be SummonOps "summon_named" strictly
        summonNamed({ op: "summon_named", name: eff.name, count: eff.count || 1 } as any, foe);
        doLog("summon", { owner: foe, name: eff.name });
    });

    // ...

    // Transform
    registerOp("transform", (eff, ctx) => {
        const into = String(eff.into || eff.name || "").trim();
        const t = (ctx.context && ((ctx.context as any).selectedCard || (ctx.context as any).targetCard)) || null;
        if (!into) return;
        if (t) {
            transformTarget(t, into);
        } else if (ctx.sourceCard && eff.target === "self") {
            transformTarget(ctx.sourceCard, into);
        } else {
            console.warn("transform: no target in context; use via select{...}");
        }
    });

}

import { BOARD_OPS } from "./boardOps.js";
export const OPS = BOARD_OPS;
