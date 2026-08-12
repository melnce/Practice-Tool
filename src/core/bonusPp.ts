/**
 * Second-player Bonus PP (early/late charges). Headless-safe — no DOM.
 */

import { state } from "./gameState.js";
import { logEvent } from "./logger.js";
import { doAction } from "./history.js";
import { getPP, setPP } from "./playerHelpers.js";

/**
 * Toggle the second player's Bonus PP for the current round tier.
 * Returns whether the action mutated state.
 */
export function toggleSecondPlayerBonusPp(): boolean {
  let mutated = false;
  doAction(
    "Second Player PP Boost",
    () => {
      if (state.phase === "gameover") return;
      if (state.activePlayer === "first") return;

      const alreadyUsed =
        (state.roundCount <= 5 && state.secondPlayerPPBoostUsedEarly) ||
        (state.roundCount > 5 && state.secondPlayerPPBoostUsedLate);
      if (alreadyUsed) return;

      if (!state.secondPlayerPPBoostPending) {
        setPP(state, "second", getPP(state, "second") + 1);
        state.secondPlayerPPBoostPending = true;
        logEvent("boost", { owner: "second", action: "activate" });
        mutated = true;
      } else {
        setPP(state, "second", getPP(state, "second") - 1);
        state.secondPlayerPPBoostPending = false;
        logEvent("boost", { owner: "second", action: "cancel" });
        mutated = true;
      }
    },
    { owner: "second" },
    { autoRender: true },
  );
  return mutated;
}
