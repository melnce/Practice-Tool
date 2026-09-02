// src/logic/effects/ops/fuse/fuse.forest.ts
import { clearSelectableFlags } from "../../../core/targeting.js";
import { logEvent } from "../../../../core/logger.js";
import type {
  Player,
  CardInstance,
  Effect,
} from "../../../../core/types/index.js";
import { alreadyFusedThisTurn, handOf } from "./types.js";
import { state } from "../../../../core/gameState.js";
import { moveToBanishZone } from "../banish/primitives.js";

// Finalize for Garden's Allure
// Owner ruling 2026-09-02: fused partners are banished (not cemetery).
export function fuse_finalize_gardens_allure(
  owner: Player,
  initiator_uid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);

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
      if (used) moveToBanishZone(used, owner);
    }
  }

  logEvent("fuseConsume", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    used: (partners || []).map((x) => x.name),
    consumedUids: (partners || []).map((x) => x.uid),
  });

  initiator.isFused = true;
  initiator.spell = [{ op: "draw", source: "deck", count: 2 }] as Effect[];
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseFinalize", {
    owner,
    kind: "forest",
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    partnerUids: (partners || []).map((x) => x.uid),
    result: "gardens_allure_mutate",
  });

  clearSelectableFlags();
  // Render removed - UI layer
}
