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

export function handleComboGate(owner: Player, eff: ComboEffect) {
    const need = Math.max(1, parseInt(String(eff.count || eff.min || 1)));
    const plays = owner === "blue" ? (state.bluePlaysThisTurn || 0) : (state.redPlaysThisTurn || 0);
    return plays >= need;
}
