// src/logic/pp.ts
import { state } from "../core/gameState.js";
import { logEvent } from "../core/logger.js";
import type { Player } from "../core/types/index.js";
import { getPermPP, setPermPP, setMaxPP } from "../core/playerHelpers.js";

export function increaseMaxPP(
  owner: Player,
  amount = 1,
  { cap = 10, recalcNow = true } = {},
) {
  const currentPerm = getPermPP(state, owner);
  const newPerm = Math.min(cap, currentPerm + amount);
  setPermPP(state, owner, newPerm);

  if (recalcNow) {
    setMaxPP(state, owner, Math.min(cap, state.roundCount + newPerm));
  }
  logEvent("maxPP", {
    owner,
    newPerm,
    newMax: Math.min(cap, state.roundCount + newPerm),
  });
}

// ✅ New, thin alias for effect-ops to call (doesn't change Dragonsign behavior)
export function addMaxPP(owner: Player, amount = 1, opts = {}) {
  return increaseMaxPP(owner, amount, opts);
}















