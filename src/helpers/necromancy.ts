// src/helpers/necromancy.ts
import { state } from "@core/gameState.js";

export function hasNecromancy(owner: "blue" | "red", cost: number = 1): boolean {
    const shadows = owner === "blue" ? state.blueShadows : state.redShadows;
    return shadows >= cost;
}

export function spendShadows(owner: "blue" | "red", cost: number = 1): void {
    if (owner === "blue") {
        state.blueShadows = Math.max(0, state.blueShadows - cost);
    } else {
        state.redShadows = Math.max(0, state.redShadows - cost);
    }
}
