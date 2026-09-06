/**
 * Second-player Bonus PP (early/late charges). Headless-safe — no DOM.
 *
 * Bible: Bonus PP is one temporary filled orb for that turn — gone after use.
 * Cancel is only legal while that orb is still unspent (current PP > max PP).
 * After spending down to max PP or below, cancel is a no-op; end of turn
 * commits the charge via secondPlayerPPBoostUsedEarly/Late.
 */

import { state } from "./gameState.js";
import { logEvent } from "./logger.js";
import { doAction } from "./history.js";
import {
  getPP,
  getBonusPpOrb,
  setBonusPpOrb,
  getMaxPP,
} from "./playerHelpers.js";

/**
 * True when the second player may activate Bonus PP, or cancel an unspent one.
 */
export function canToggleSecondPlayerBonusPp(): boolean {
  if (state.phase === "gameover" || state.phase === "mulligan") return false;
  if (state.activePlayer !== "second") return false;

  const alreadyUsed =
    (state.roundCount <= 5 && state.secondPlayerPPBoostUsedEarly) ||
    (state.roundCount > 5 && state.secondPlayerPPBoostUsedLate);
  if (alreadyUsed) return false;

  if (!state.secondPlayerPPBoostPending) return true;

  // Cancel only while the bonus orb remains unspent.
  return getBonusPpOrb(state, "second") > 0;
}

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
        setBonusPpOrb(state, "second", 1);
        state.secondPlayerPPBoostPending = true;
        logEvent("boost", { owner: "second", action: "activate" });
        mutated = true;
        return;
      }

      // Cancel: refund only if the temporary orb is still unspent.
      if (getBonusPpOrb(state, "second") <= 0) {
        // Spent — cannot undo without reclaiming spent PP.
        logEvent("boost", {
          owner: "second",
          action: "cancel_blocked_spent",
          pp: getPP(state, "second"),
          maxPP: getMaxPP(state, "second"),
        });
        return;
      }

      setBonusPpOrb(state, "second", 0);
      state.secondPlayerPPBoostPending = false;
      logEvent("boost", { owner: "second", action: "cancel" });
      mutated = true;
    },
    { owner: "second" },
    { autoRender: true },
  );
  return mutated;
}
