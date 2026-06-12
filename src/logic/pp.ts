// src/logic/pp.ts
import { state } from "../core/gameState.js";
import { logEvent } from "../core/logger.js";
import type { Player } from "../core/types/index.js";
import { getPermPP, setPermPP, setMaxPP, getMaxPP } from "../core/playerHelpers.js";

export function increaseMaxPP(
  owner: Player,
  amount = 1,
  { cap = 10, recalcNow = true } = {},
) {
  const currentPerm = getPermPP(state, owner);
  const newPerm = Math.min(cap, currentPerm + amount);
  setPermPP(state, owner, newPerm);

  if (recalcNow) {
    setMaxPP(state, owner, Math.min(state.roundCount + newPerm, cap));
  }
  logEvent("maxPP", {
    owner,
    newPerm,
    newMax: getMaxPP(state, owner),
  });
}

export function addMaxPP(owner: Player, amount = 1, opts = {}) {
  return increaseMaxPP(owner, amount, opts);
}















