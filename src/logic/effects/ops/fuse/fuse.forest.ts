// src/logic/effects/ops/fuse/fuse.forest.ts
import { clearSelectableFlags } from "../../../core/targeting.js";
import { logEvent } from "../../../../core/logger.js";
import type { Player, CardInstance, Effect } from "../../../../core/types/index.js";
import { alreadyFusedThisTurn, handOf, graveOf } from "./types.js";
import { state } from "../../../../core/gameState.js";

// Finalize for Garden's Allure
export function fuse_finalize_gardens_allure(
  owner: Player,
  initiator_uid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const grave = graveOf(owner);

  const initiator = hand.find((c) => c?.uid === initiator_uid);
  if (!initiator) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    console.warn("[Fuse] This copy already fused this turn.");
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    clearSelectableFlags();
    // Render removed - UI layer
    return "done";
  }

  for (const p of partners || []) {
    const idx = hand.findIndex((c) => c.uid === p.uid);
    if (idx !== -1) {
      const [used] = hand.splice(idx, 1);
      if (used) grave.push(used);
    }
  }

  logEvent("fuseConsume", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    used: (partners || []).map((x) => x.name),
  });

  initiator.isFused = true;
  initiator.spell = [{ op: "draw", count: 2 }] as Effect[];
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseFinalize", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    result: "gardens_allure_mutate",
  });

  clearSelectableFlags();
  // Render removed - UI layer
}















