// src/logic/effects/cards/runecraft/earth.ts
import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { logEvent } from "@core/logger.js";
function board(owner) { return owner === "blue" ? state.blueBoard : state.redBoard; }
function isWitchsNewBrew(card) {
    const n = String(card?.name || "").toLowerCase();
    return n.includes("witch") && n.includes("brew");
}
export function hasEarthSigils(owner, amount = 1) {
    const b = board(owner);
    return b.some(c => c?.type === "Amulet" && (c.counters?.earth || 0) >= amount);
}
export function consumeEarthSigils(owner, amount = 1) {
    const b = board(owner);
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;
    for (let i = 0; i < b.length; i++) {
        const c = b[i];
        if (c?.type === "Amulet" && (c.counters?.earth || 0) >= amount) {
            c.counters.earth -= amount;
            // Log the earth sigil consumption
            logEvent("earthConsume", { owner, amount, card: c.name, uid: c.uid });
            if (c.counters.earth <= 0 && (isWitchsNewBrew(c) || c.destroyOnEmpty)) {
                grave.push(b.splice(i, 1)[0]);
                // Log the earth sigil destruction
                logEvent("earthSigilDestroyed", { owner, card: c.name, uid: c.uid });
                // Increment shadows for the owner
                if (owner === "blue")
                    state.blueShadows++;
                else
                    state.redShadows++;
                render();
            }
            return true;
        }
    }
    return false;
}
