// src/logic/effects/ops/earth.ts
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import type { Player } from "../../../core/types/index.js";
import {
  getBoard,
  getGraveyard,
  addShadows,
} from "../../../core/playerHelpers.js";
import { fireTrigger } from "../../core/triggers.js";
import { bumpZoneVersion } from "../../core/triggers/utils.js";

function board(owner: Player) {
  return getBoard(state, owner);
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

      logEvent("earthConsume", { owner, amount, card: c.name, uid: c.uid });

      if (c.counters!.earth! <= 0 && c.destroyOnEmpty) {
        const removed = b.splice(i, 1)[0];
        if (removed) {
          grave.push(removed);
          bumpZoneVersion();

          logEvent("earthSigilDestroyed", { owner, card: c.name, uid: c.uid });

          addShadows(state, owner, 1);
        }
      }
      fireTrigger("ally_earth_rite", owner, { sourceCard: c });
      return true;
    }
  }
  return false;
}
