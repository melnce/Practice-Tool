// src/logic/effects/ops/fuse/fuse.forest.ts
import { state } from "../../../../core/gameState.js";
import { adapter } from "../../../../core/adapter.js";
import { clearSelectableFlags } from "../../../core/targeting.js";
import { logEvent } from "../../../../core/logger.js";
import { Player, CardInstance } from "../../../../core/types.js";

function handOf(owner: Player) {
  return owner === "blue" ? state.blueHand : state.redHand;
}

function graveOf(owner: Player) {
  return owner === "blue" ? state.blueGraveyard : state.redGraveyard;
}

function alreadyFusedThisTurn(card: CardInstance) {
  return !!card && card.lastFuseRound === state.roundCount;
}

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
    adapter.render();
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
    adapter.render();
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
  initiator.spell = [{ op: "draw", count: 2 } as any];
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseFinalize", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    result: "gardens_allure_mutate",
  });

  clearSelectableFlags();
  adapter.render();
}
