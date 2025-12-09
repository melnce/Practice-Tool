// src/helpers/necromancy.js
import { state } from "@core/gameState.js";
export function hasNecromancy(owner, cost = 1) {
    const shadows = owner === "blue" ? state.blueShadows : state.redShadows;
    return shadows >= cost;
}
export function spendShadows(owner, cost = 1) {
    if (owner === "blue") {
        state.blueShadows = Math.max(0, state.blueShadows - cost);
    }
    else {
        state.redShadows = Math.max(0, state.redShadows - cost);
    }
}
