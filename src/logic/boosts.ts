// src/logic/boosts.ts
import { state } from "../core/gameState.js";
import { logEvent } from "../core/logger.js";
import { doAction } from "../core/history.js";
import { getPP, setPP } from "../core/playerHelpers.js";

export function useSecondPlayerPPBoost() {
  return doAction(
    "Second Player PP Boost",
    () => {
      if (state.activePlayer === "first") return;

      // Button ID is "redBoost" in the HTML
      const boostBtn = document.getElementById("redBoost");

      const alreadyUsed =
        (state.roundCount <= 5 && state.secondPlayerPPBoostUsedEarly) ||
        (state.roundCount > 5 && state.secondPlayerPPBoostUsedLate);
      if (alreadyUsed) return;

      if (!state.secondPlayerPPBoostPending) {
        setPP(state, "second", getPP(state, "second") + 1);
        state.secondPlayerPPBoostPending = true;
        boostBtn?.classList.add("used");
        logEvent("boost", { owner: "second", action: "activate" });
      } else {
        setPP(state, "second", getPP(state, "second") - 1);
        state.secondPlayerPPBoostPending = false;
        boostBtn?.classList.remove("used");
        logEvent("boost", { owner: "second", action: "cancel" });
      }
      // Render removed - UI layer
    },
    { owner: "second" },
    { autoRender: true },
  );
}

// Legacy export for backwards compatibility during transition
export const useRedBoost = useSecondPlayerPPBoost;
