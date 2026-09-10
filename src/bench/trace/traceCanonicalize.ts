// src/bench/trace/traceCanonicalize.ts — content-addressed choice canonicalization

import type { GameState, Player } from "../../core/types/index.js";
import type { SoakAction } from "../soakEnv.js";
import { getHand, getDeck, getGraveyard } from "../../core/playerHelpers.js";
import { findCardInZones } from "./neutralAction.js";

type ContentZone = "hand" | "deck" | "cemetery";

export type CanonicalizeCtx = {
  /** Soak legality list for the current state (offered CHOOSE_TARGET uids). */
  legalSoakActions?: SoakAction[];
};

function zoneCards(gameState: GameState, player: Player, zone: ContentZone) {
  switch (zone) {
    case "hand":
      return getHand(gameState, player);
    case "deck":
      return getDeck(gameState, player);
    case "cemetery":
      return getGraveyard(gameState, player);
  }
}

function offeredChooseTargetUids(ctx?: CanonicalizeCtx): Set<string> | null {
  const legal = ctx?.legalSoakActions;
  if (!legal) return null;
  const out = new Set<string>();
  for (const action of legal) {
    if (action.type === "CHOOSE_TARGET" && action.target.type === "card") {
      out.add(action.target.uid);
    }
  }
  return out;
}

function firstUidByCardId(
  gameState: GameState,
  player: Player,
  zone: ContentZone,
  cardId: string,
  allowedUids: Set<string> | null,
): string | null {
  for (const card of zoneCards(gameState, player, zone)) {
    if (!card || String(card.id) !== cardId) continue;
    if (allowedUids && !allowedUids.has(card.uid)) continue;
    return card.uid;
  }
  return null;
}

function canonicalizeChooseTarget(
  action: Extract<SoakAction, { type: "CHOOSE_TARGET" }>,
  gameState: GameState,
  ctx?: CanonicalizeCtx,
): SoakAction {
  if (action.target.type !== "card") return action;
  const loc = findCardInZones(gameState, action.target.uid);
  if (!loc) return action;
  const zone = loc.zone;
  if (zone !== "hand" && zone !== "deck" && zone !== "cemetery") {
    return action;
  }
  const offered = offeredChooseTargetUids(ctx);
  const firstUid = firstUidByCardId(
    gameState,
    loc.player,
    zone,
    String(loc.card.id),
    offered,
  );
  if (!firstUid || firstUid === action.target.uid) return action;
  return {
    ...action,
    target: { type: "card", uid: firstUid },
  };
}

/** Map uid-based card picks to the lowest-position offered copy in hand/deck/cemetery. */
export function canonicalizeTraceAction(
  action: SoakAction,
  gameState: GameState,
  ctx?: CanonicalizeCtx,
): SoakAction {
  if (action.type === "CHOOSE_TARGET") {
    return canonicalizeChooseTarget(action, gameState, ctx);
  }
  return action;
}
