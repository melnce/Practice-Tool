// src/logic/boosts.ts
import { state } from "../core/gameState.js";
import { toggleSecondPlayerBonusPp } from "../core/bonusPp.js";

export function useSecondPlayerPPBoost() {
  const ok = toggleSecondPlayerBonusPp();
  const boostBtn = document.getElementById("redBoost");
  if (state.secondPlayerPPBoostPending) boostBtn?.classList.add("used");
  else boostBtn?.classList.remove("used");
  return ok;
}

// Legacy export for backwards compatibility during transition
export const useRedBoost = useSecondPlayerPPBoost;
