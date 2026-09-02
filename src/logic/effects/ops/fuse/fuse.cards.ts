// src/logic/effects/ops/fuse/fuse.cards.ts
// Generic "Fuse: Cards" — any hand card may be fused (no recipe whitelist).

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type { Player, CardInstance } from "../../../../core/types/index.js";
import { alreadyFusedThisTurn, handOf, emitOnFuse } from "./types.js";
import { adapter } from "../../../../core/adapter.js";
import { moveToBanishZone } from "../banish/primitives.js";

/**
 * Finalize Fuse: Cards.
 *
 * Owner ruling 2026-08-29: fuse as many hand cards as you want into ONE host
 * ONCE per turn. Owner ruling 2026-09-02: consumed partners are **banished**
 * (not cemetery) — they never died on the field. No shadows. `on_fuse` fires
 * once for the fuse action (not once per partner) — same pattern as loot fuse.
 * Lifecycle cleanup is owned by the targeting orchestrator — do not call
 * clearSelectableFlags here.
 */
export function fuse_finalize_cards(
  owner: Player,
  initiator_uid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);

  const initiator = hand.find((c) => c?.uid === initiator_uid);
  if (!initiator) {
    adapter.notifyBlocked("Fuse failed: card is not in hand.");
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    const reason = "Already fused this turn.";
    console.warn("[Fuse]", reason);
    adapter.notifyBlocked(reason);
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    return;
  }

  const used = (partners || []).filter(
    (p) => !!p?.uid && hand.some((c) => c?.uid === p.uid),
  );
  if (!used.length) {
    adapter.notifyBlocked("No fuse partners selected.");
    return;
  }

  const consumedNames: string[] = [];
  const consumedUids: string[] = [];
  // Remove highest indices first so earlier splices stay valid.
  const idxs = used
    .map((p) => hand.findIndex((c) => c?.uid === p.uid))
    .filter((i) => i !== -1)
    .sort((a, b) => b - a);

  let primaryPartner: CardInstance | undefined;
  for (const idx of idxs) {
    const [consumed] = hand.splice(idx, 1);
    if (!consumed) continue;
    // Hand→banish directly. Do NOT call banishCard — it only searches boards
    // and would fire leave-field triggers for a card that was never on field.
    moveToBanishZone(consumed, owner);
    consumedNames.push(String(consumed.name || ""));
    consumedUids.push(String(consumed.uid || ""));
    if (!primaryPartner) primaryPartner = consumed;
  }

  const prev = Array.isArray(initiator._fusedCards)
    ? initiator._fusedCards
    : [];
  initiator._fusedCards = [...prev, ...consumedNames];
  initiator.isFused = true;
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseConsume", {
    owner,
    kind: "cards",
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    used: consumedNames,
    consumedUids,
  });

  logEvent("fuseFinalize", {
    owner,
    kind: "cards",
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    partnerUids: consumedUids,
    result: "fused_cards",
  });

  state.lastFuse = {
    owner,
    time: state.gameTick,
    initiator_name: initiator?.name,
    partner_name: consumedNames.join(", "),
    result_name: "fused_cards",
    targets: "initiator",
  };

  // Fire on_fuse once per fuse action (not once per consumed card).
  emitOnFuse(owner, {
    initiator,
    partner: primaryPartner,
    initiatorUid: initiator.uid,
  });
}
