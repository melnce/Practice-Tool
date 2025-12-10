// src/logic/pp.ts
import { state } from "@core/gameState.js";
import { logEvent } from "@core/logger.js";
import { Player } from "@core/types.js";


export function increaseMaxPP(owner: Player, amount = 1, { cap = 10, recalcNow = true } = {}) {
    const permPPKey = owner === "blue" ? "bluePermPP" : "redPermPP";
    const maxPPKey = owner === "blue" ? "blueMaxPP" : "redMaxPP";

    state[permPPKey] = Math.min(cap, (state[permPPKey] || 0) + amount);

    if (recalcNow) {
        state[maxPPKey] = Math.min(cap, state.roundCount + (state[permPPKey] || 0));
    }
    logEvent("maxPP", { owner, newPerm: state[permPPKey], newMax: state[maxPPKey] });
}

// ✅ New, thin alias for effect-ops to call (doesn't change Dragonsign behavior)
export function addMaxPP(owner: Player, amount = 1, opts = {}) {
    return increaseMaxPP(owner, amount, opts);
}
