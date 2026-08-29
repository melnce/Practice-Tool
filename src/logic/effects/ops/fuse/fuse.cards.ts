// src/logic/effects/ops/fuse/fuse.cards.ts
// Generic "Fuse: Cards" — any hand card may be fused (no recipe whitelist).

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type { Player, CardInstance } from "../../../../core/types/index.js";
import { alreadyFusedThisTurn, handOf, graveOf, emitOnFuse } from "./types.js";

export function fuse_finalize_cards(
  owner: Player,
  initiator_uid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const grave = graveOf(owner);

  const initiator = hand.find((c) => c?.uid === initiator_uid);
  if (!initiator) return;

  if (alreadyFusedThisTurn(initiator)) {
    console.warn("[Fuse] This copy already fused this turn.");
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    return;
  }

  const partner = (partners || [])[0];
  if (!partner) return;

  const pIdx = hand.findIndex((c) => c?.uid === partner.uid);
  if (pIdx === -1) return;

  const [consumed] = hand.splice(pIdx, 1);
  if (consumed) grave.push(consumed);

  const prev = Array.isArray(initiator._fusedCards)
    ? initiator._fusedCards
    : [];
  initiator._fusedCards = [...prev, String(consumed?.name || "")];
  initiator.isFused = true;
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseConsume", {
    owner,
    kind: "cards",
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    used: [consumed?.name],
    consumedUids: [consumed?.uid],
  });

  logEvent("fuseFinalize", {
    owner,
    kind: "cards",
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    partnerUids: [consumed?.uid],
    result: "fused_cards",
  });

  state.lastFuse = {
    owner,
    time: state.gameTick,
    initiator_name: initiator?.name,
    partner_name: consumed?.name,
    result_name: "fused_cards",
    targets: "initiator",
  };

  emitOnFuse(owner, {
    initiator,
    partner: consumed,
    initiatorUid: initiator.uid,
  });
}
