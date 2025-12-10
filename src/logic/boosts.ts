// src/logic/boosts.ts
import { state } from "@core/gameState.js";
// @ts-ignore
import { render } from "@ui/render.js";
import { logEvent } from "@core/logger.js";
import { doAction } from "@core/history.js";

export function useRedBoost() {
    return doAction(
        "Red Boost",
        () => {
            if (state.isBlueTurn) return;

            const boostBtn = document.getElementById("redBoost");

            const alreadyUsed = (state.roundCount <= 5 && state.redBoostUsedEarly) ||
                (state.roundCount > 5 && state.redBoostUsedLate);
            if (alreadyUsed) return;

            if (!state.redBoostPending) {
                state.redPP++;
                state.redBoostPending = true;
                boostBtn?.classList.add("used");
                logEvent("boost", { owner: "red", action: "activate" });
            } else {
                state.redPP--;
                state.redBoostPending = false;
                boostBtn?.classList.remove("used");
                logEvent("boost", { owner: "red", action: "cancel" });
            }
            render();
        },
        { owner: "red" },
        { autoRender: false }
    );
}
