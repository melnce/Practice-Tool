import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type { Player } from "../../../../core/types/index.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { makeCardFromDB, pushToBoard, boardHasRoom } from "./core.js";
import { boardOf } from "./utils.js";
import { recomputeAttackFlags } from "../../../core/combat.js";

export function reanimateSummon(c: any, owner: Player) {
  if (!c || c.type !== "Follower") return;

  const board = boardOf(owner);
  if (!boardHasRoom(board)) return;

  const base = getCardDetails(c.id) || getCardDetails(c.name);
  if (!base) return;
  const copy = makeCardFromDB(base, owner);

  // Reanimates enter 'justPlayed', but Rush/Storm should still work this turn:
  // - Storm: can attack leaders & followers
  // - Rush:  can attack followers only
  copy.hasAttacked = false;
  copy.attacks_left = copy.attacks_per_turn ?? 1;
  if (copy.hasStorm || copy.hasRush || copy.hasEvolved) {
    copy.can_attack_followers = true;
  }
  recomputeAttackFlags(copy);

  // Ensure reanimated units gain the Departed tribe
  copy.tribes = Array.isArray(copy.tribes) ? copy.tribes : [];
  if (!copy.tribes.includes("Departed")) copy.tribes.push("Departed");

  // Push to board and track lastSummoned
  if (pushToBoard(board, owner, copy)) {
    logEvent("reanimateSummon", { owner, card: copy.name, uid: copy.uid });
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(copy);
    }
  }
}
