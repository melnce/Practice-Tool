// src/logic/effects/ops/earth.ts
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import type { Player, CardInstance } from "../../../core/types/index.js";
import {
  getBoard,
  getGraveyard,
  addShadows,
} from "../../../core/playerHelpers.js";

function board(owner: Player) {
  return getBoard(state, owner);
}
function isWitchsNewBrew(card: CardInstance) {
  const n = String(card?.name || "").toLowerCase();
  return n.includes("witch") && n.includes("brew");
}

export function hasEarthSigils(owner: Player, amount = 1) {
  const b = board(owner);
  return b.some(
    (c) => c?.type === "Amulet" && (c.counters?.earth || 0) >= amount,
  );
}

export function consumeEarthSigils(owner: Player, amount = 1) {
  const b = board(owner);
  const grave = getGraveyard(state, owner);

  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c?.type === "Amulet" && (c.counters?.earth || 0) >= amount) {
      c.counters!.earth! -= amount;

      // Log the earth sigil consumption
      logEvent("earthConsume", { owner, amount, card: c.name, uid: c.uid });

      if (c.counters!.earth! <= 0 && (isWitchsNewBrew(c) || c.destroyOnEmpty)) {
        const removed = b.splice(i, 1)[0];
        if (removed) {
          grave.push(removed);

          // Log the earth sigil destruction
          logEvent("earthSigilDestroyed", { owner, card: c.name, uid: c.uid });

          // Increment shadows for the owner
          addShadows(state, owner, 1);
          // Render removed - UI layer
        }
      }
      return true;
    }
  }
  return false;
}
