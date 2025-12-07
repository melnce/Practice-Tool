import { state } from "@core/gameState.js";
import { logEvent } from "@core/logger.js";

/**
 * Handles healing a leader's defense.
 * Now respects the dynamic maximum HP for each player.
 */
export function handleHealLeader(owner, eff) {
  const amt = parseInt(eff.amount) || 0;

  const targetPlayerIsBlue =
    (eff.player || "self") === "self" ? owner === "blue" : owner !== "blue";

  logEvent("healLeader", { target: targetPlayerIsBlue ? "blue" : "red", amount: amt });

  // Apply healing, respecting the new dynamic max HP
  if (targetPlayerIsBlue) {
    state.blueHP = Math.max(0, Math.min(state.blueMaxHP, state.blueHP + amt)); // <-- MODIFIED
  } else {
    state.redHP = Math.max(0, Math.min(state.redMaxHP, state.redHP + amt)); // <-- MODIFIED
  }
}

/**
 * NEW: Sets a leader's maximum HP to a specific value.
 */
export function handleSetMaxHP(eff, owner) {
  const targetPlayerString = eff.player || "self"; // 'self' or 'opponent'
  const amount = parseInt(eff.amount) || 20;

  const isOpponent = targetPlayerString === "opponent";
  const targetOwner = isOpponent ? (owner === "blue" ? "red" : "blue") : owner;

  logEvent("setLeaderMaxHP", { owner: targetOwner, maxHP: amount });

  if (targetOwner === "blue") {
    state.blueMaxHP = amount;
    // Clamp current HP to the new max (no accidental +amt)
    state.blueHP = Math.max(0, Math.min(state.blueMaxHP, state.blueHP));
  } else {
    state.redMaxHP = amount;
    state.redHP = Math.max(0, Math.min(state.redMaxHP, state.redHP));
  }
}

/**
 * Handles recovering a player's play points for the current turn.
 * (This function is unchanged)
 */
export function handleRecoverPP(owner, eff) {
  // Determine target side
  const targetIsBlue =
    (eff.player || "self") === "self" ? owner === "blue" : owner !== "blue";

  const cur = targetIsBlue ? state.bluePP : state.redPP;
  const max = targetIsBlue ? state.blueMaxPP : state.redMaxPP;

  // Allow symbolic "full" refills (your card uses "currentMaxPP")
  let amt;
  if (
    typeof eff.amount === "string" &&
    eff.amount.toLowerCase() === "currentmaxpp"
  ) {
    amt = Math.max(0, max - cur);
  } else {
    amt = parseInt(eff.amount) || 0;
  }

  const next = Math.min(max, cur + amt);
  if (targetIsBlue) state.bluePP = next;
  else state.redPP = next;
}

/**
 * (This function is unchanged but will now work correctly
 * because it calls the updated handleHealLeader)
 */
export function handleDynamicHealLeader(owner, eff) {
  const hand = owner === "blue" ? state.blueHand : state.redHand;
  const amt = hand.length; // X is number of cards in hand
  handleHealLeader(owner, { ...eff, amount: amt });
}

/* ---------- NEW: leader barrier state ops ---------- */
export function grantLeaderBarrier(owner, charges = 1) {
  logEvent("leaderBarrierGrant", { owner, charges });
  const keyC = owner === "blue" ? "blueLeaderBarrier" : "redLeaderBarrier";
  state[keyC] = Math.max(0, (state[keyC] | 0) + (charges | 0));
}

export function popLeaderBarrier(owner, reason = "damage_prevent") {
  const keyC = owner === "blue" ? "blueLeaderBarrier" : "redLeaderBarrier";
  if ((state[keyC] | 0) > 0) {
    logEvent("leaderBarrierPop", { owner, reason });
    state[keyC] = (state[keyC] | 0) - 1;
    // optional UI flags:
    const keyFx =
      owner === "blue" ? "blueLeaderBarrierPopped" : "redLeaderBarrierPopped";
    state[keyFx] = reason;
    return true;
  }
  return false;
}

/** Centralized leader damage that respects barrier and max HP */
export function applyLeaderDamage(owner, amount) {
  const hpKey = owner === "blue" ? "blueHP" : "redHP";
  const maxKey = owner === "blue" ? "blueMaxHP" : "redMaxHP";

  if ((amount | 0) <= 0) return 0;

  logEvent("leaderDamage", { owner, amount });

  // Barrier soaks the *whole packet* and consumes 1 charge
  if (popLeaderBarrier(owner, "leader_hit")) return 0;

  const cur = state[hpKey] | 0;
  const next = Math.max(0, cur - (amount | 0));
  state[hpKey] = next;
  // clamp not needed downward; max clamp occurs on heals
  return cur - next;
}

/* ---------- NEW: effect op for cards ---------- */
export function handleLeaderBarrierOp(owner, eff) {
  const target =
    (eff.player || "self") === "self"
      ? owner
      : owner === "blue"
      ? "red"
      : "blue";
  const charges = parseInt(eff.charges ?? eff.amount ?? 1) || 1;
  grantLeaderBarrier(target, charges);
}
