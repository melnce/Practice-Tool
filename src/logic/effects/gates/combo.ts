// src/logic/effects/gates/combo.ts
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import { Player } from "../../../core/types.js";

interface ComboEffect {
    amount?: number;
    count?: number;
    min?: number;
}

export function handleComboAdd(owner: Player, eff: ComboEffect) {
    const add = parseInt(String(eff.amount ?? eff.count ?? 1)) || 0;
    if (owner === "blue") {
        state.bluePlaysThisTurn = (state.bluePlaysThisTurn || 0) + add;
        logEvent("comboAdd", { owner, add, plays: state.bluePlaysThisTurn });
    } else {
        state.redPlaysThisTurn = (state.redPlaysThisTurn || 0) + add;
        logEvent("comboAdd", { owner, add, plays: state.redPlaysThisTurn });
    }
}

export function handleComboGate(eff: ComboEffect & { effects?: any[], else_effects?: any[] }, ctx: any) {
    const need = Math.max(1, parseInt(String(eff.count || eff.min || 1)));
    const plays = ctx.owner === "blue" ? (state.bluePlaysThisTurn || 0) : (state.redPlaysThisTurn || 0);

    const conditionMet = plays >= need;
    const next = (conditionMet ? eff.effects : eff.else_effects) || [];

    if (next.length && Array.isArray(ctx.queue)) {
        ctx.queue.unshift(...next);
    }
    logEvent("gateBranch", { gate: "combo_gate", branch: conditionMet ? "effects" : "else_effects", plays, need });

    return "done";
}
