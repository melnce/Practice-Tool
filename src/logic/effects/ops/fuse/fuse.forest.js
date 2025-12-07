// @effects/fuse.forest.js
import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { clearSelectableFlags } from "@logic/core/targeting.js";
import { logEvent } from "@core/logger.js";

function handOf(owner) {
  return owner === "blue" ? state.blueHand : state.redHand;
}

function graveOf(owner) {
  return owner === "blue" ? state.blueGraveyard : state.redGraveyard;
}

function alreadyFusedThisTurn(card) {
  return !!card && card.lastFuseRound === state.roundCount;
}

// Finalize for Garden's Allure
export function fuse_finalize_gardens_allure(owner, initiator_uid, partners) {
  const hand  = handOf(owner);
  const grave = graveOf(owner);

  const initiator = hand.find(c => c?.uid === initiator_uid);
  if (!initiator) { clearSelectableFlags(); render(); return; }

  if (alreadyFusedThisTurn(initiator)) {
    console.warn("[Fuse] This copy already fused this turn.");
    logEvent("fuseBlocked", { owner, reason: "already_fused_this_turn", initiator: initiator?.name });
    clearSelectableFlags(); render(); return "done";
  }

  for (const p of partners || []) {
    const idx = hand.findIndex(c => c.uid === p.uid);
    if (idx !== -1) {
      const [used] = hand.splice(idx, 1);
      grave.push(used);
    }
  }

  logEvent("fuseConsume", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    used: (partners||[]).map(x=>x.name),
  });

  initiator.isFused = true;
  initiator.spell = [{ op: "draw", count: 2 }];
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseFinalize", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    result: "gardens_allure_mutate",
  });

  clearSelectableFlags(); render();
}
