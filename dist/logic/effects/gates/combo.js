import { state } from "@core/gameState.js";
import { logEvent } from "@core/logger.js";
export function handleComboAdd(owner, eff) {
    const add = parseInt(eff.amount ?? eff.count ?? 1) || 0;
    if (owner === "blue") {
        state.bluePlaysThisTurn = (state.bluePlaysThisTurn || 0) + add;
        logEvent("comboAdd", { owner, add, plays: state.bluePlaysThisTurn }); // ← add
    }
    else {
        state.redPlaysThisTurn = (state.redPlaysThisTurn || 0) + add;
        logEvent("comboAdd", { owner, add, plays: state.redPlaysThisTurn }); // ← add
    }
}
export function handleComboGate(owner, eff) {
    const need = Math.max(1, parseInt(eff.count || eff.min || 1));
    const plays = owner === "blue" ? (state.bluePlaysThisTurn || 0) : (state.redPlaysThisTurn || 0);
    return plays >= need;
}
