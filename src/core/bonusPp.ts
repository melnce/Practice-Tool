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
import { getPP, setPP, getMaxPP } from "./playerHelpers.js";

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
  return getPP(state, "second") > getMaxPP(state, "second");
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
        setPP(state, "second", getPP(state, "second") + 1);
        state.secondPlayerPPBoostPending = true;
        logEvent("boost", { owner: "second", action: "activate" });
        mutated = true;
        return;
      }

      // Cancel: refund only if the temporary orb is still unspent.
      const cur = getPP(state, "second");
      const max = getMaxPP(state, "second");
      if (cur <= max) {
        // Spent — cannot undo without driving PP negative / reclaiming spent PP.
        logEvent("boost", {
          owner: "second",
          action: "cancel_blocked_spent",
          pp: cur,
          maxPP: max,
        });
        return;
      }

      setPP(state, "second", cur - 1);
      state.secondPlayerPPBoostPending = false;
      logEvent("boost", { owner: "second", action: "cancel" });
      mutated = true;
    },
    { owner: "second" },
    { autoRender: true },
  );
  return mutated;
}
