// src/logic/effects/hand.ts
import { state } from "../../core/gameState.js";
// Legacy getCardDetails import removed - discard handlers don't need card lookup
import { highlightSelectable } from "../core/targeting.js";
import { setPendingTarget } from "../core/pendingTarget/index.js";

import { logEvent } from "../../core/logger.js";
import type { Player, Effect, CardInstance } from "../../core/types/index.js";
import { getHand, getGraveyard, addShadows } from "../../core/playerHelpers.js";
import { toUids } from "../../core/uidResolver.js";

// ========================================================================
// UNIFIED DISCARD HANDLER - routes by mode field
// ========================================================================

export type DiscardMode = "select" | "except_named";

function rememberDiscardedCards(discarded: CardInstance[]): void {
  if (!discarded.length) return;
  state.lastDiscardedCosts = discarded.map(
    (card) => parseInt(String(card.cost), 10) || 0,
  );
  state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
  state.lastDiscardedTypes = discarded.map((card) => String(card.type || ""));
  state.lastDiscardedType = state.lastDiscardedTypes[0] || "";
}

export function handleDiscard(
  eff: Effect & { mode?: DiscardMode },
  owner: Player,
  resumeEffects: Effect[] = [],
  sourceCard: CardInstance | null = null,
): void | "pending" {
  const mode = (eff.mode || "select") as DiscardMode;

  switch (mode) {
    case "except_named":
      handleDiscardAllExceptNamed(eff, owner);
      return;

    case "select":
    default:
      return handleDiscardSelectHand(eff, owner, resumeEffects, sourceCard);
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

  const discarded: CardInstance[] = [];

  for (let i = hand.length - 1; i >= 0; i--) {
    const c = hand[i];
    if (c && keepSet.has(String(c.name))) continue; // keep
    const removed = hand.splice(i, 1)[0];
    if (removed) {
      removed.cost_mod = 0; // Reset cost when entering graveyard
      grave.push(removed); // discard
      discarded.push(removed);
    }
  }

  if (discarded.length > 0) {
    rememberDiscardedCards(discarded);
    logEvent("discard", { owner, count: discarded.length });
    addShadows(state, owner, discarded.length);
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
  sourceCard: CardInstance | null = null,
) {
  const n = Math.max(0, parseInt((eff.count as any) ?? 1, 10));
  const hand = getHand(state, owner);
  if (n <= 0 || hand.length === 0) return;

  const filterType = String((eff as any).filter?.type || "").toLowerCase();
  const pool = filterType
    ? hand.filter((card) => String(card.type).toLowerCase() === filterType)
    : [...hand];
  if (pool.length === 0) return;
  const selectCount = Math.min(n, pool.length);

  setPendingTarget({
    op: "discard_select_hand",
    eff: { ...eff, select_count: selectCount },
    owner,
    sourceCard,
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
