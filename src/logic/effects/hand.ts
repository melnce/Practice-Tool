// src/logic/effects/hand.ts
import { state } from "../../core/gameState.js";
// Legacy getCardDetails import removed - discard handlers don't need card lookup
import { highlightSelectable } from "../core/targeting.js";
import { setPendingTarget } from "../core/pendingTarget/index.js";

import { logEvent } from "../../core/logger.js";
import type { Player, Effect } from "../../core/types/index.js";
import { getHand, getGraveyard, addShadows } from "../../core/playerHelpers.js";
import { toUids } from "../../core/uidResolver.js";

// ========================================================================
// UNIFIED DISCARD HANDLER - routes by mode field
// ========================================================================

export type DiscardMode = "select" | "except_named";

export function handleDiscard(
  eff: Effect & { mode?: DiscardMode },
  owner: Player,
  resumeEffects: Effect[] = [],
): void | "pending" {
  const mode = (eff.mode || "select") as DiscardMode;

  switch (mode) {
    case "except_named":
      handleDiscardAllExceptNamed(eff, owner);
      return;

    case "select":
    default:
      return handleDiscardSelectHand(eff, owner, resumeEffects);
  }
}

// ========================================================================
// INTERNAL HANDLERS
// ========================================================================

export function handleDiscardAllExceptNamed(eff: Effect, owner: Player) {
  const names = ((eff as any).names || (eff as any).name || []).map(String);
  const keepSet = new Set(names);
  const hand = getHand(state, owner);
  const grave = getGraveyard(state, owner);

  let discarded = 0;

  for (let i = hand.length - 1; i >= 0; i--) {
    const c = hand[i];
    if (c && keepSet.has(String(c.name))) continue; // keep
    const removed = hand.splice(i, 1)[0];
    if (removed) {
      removed.cost_mod = 0; // Reset cost when entering graveyard
      grave.push(removed); // discard
      discarded++;
    }
  }

  if (discarded > 0) {
    logEvent("discard", { owner, count: discarded });
    addShadows(state, owner, discarded);
  }
}

/**
 * Start a "select N cards from hand to discard" interaction.
 * Returns "pending" when it needs user input so runEffects pauses.
 */
export function handleDiscardSelectHand(
  eff: Effect,
  owner: Player,
  resumeEffects: Effect[] = [],
) {
  const n = Math.max(0, parseInt((eff.count as any) ?? 1, 10));
  const hand = getHand(state, owner);
  if (n <= 0 || hand.length === 0) return;

  const selectCount = Math.min(n, hand.length);
  const pool = [...hand];

  setPendingTarget({
    op: "discard_select_hand",
    eff: { ...eff, select_count: selectCount },
    owner,
    sourceCard: null,
    pool,
    poolUids: toUids(pool),
    selectCount,
    targets: [],
    targetUids: [],
    resumeEffects,
  } as any);

  // mark with the correct flag and render
  highlightSelectable(pool); // sets __uiSelectable + render()
  return "pending";
}

// Legacy handleTransformInHand was removed - now handled by unified transform op with zone: "hand"















