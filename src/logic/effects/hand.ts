// src/logic/effects/hand.ts
import { state } from "../../core/gameState.js";
// Legacy getCardDetails import removed - discard handlers don't need card lookup
import { highlightSelectable } from "../core/targeting.js";
import {
  trySetPendingTarget,
  reportSelectFizzled,
} from "../core/pendingTarget/index.js";

import { logEvent } from "../../core/logger.js";
import type { Player, Effect, CardInstance } from "../../core/types/index.js";
import { rejectUnsupportedPoolNarrowKeys } from "../core/targeting/poolCondition.js";
import { getHand, getGraveyard, addShadows } from "../../core/playerHelpers.js";
import { bumpZoneVersion } from "../core/triggers/utils.js";
import { toUids } from "../../core/uidResolver.js";
import { runEffects } from "../core/effects/index.js";

// ========================================================================
// UNIFIED DISCARD HANDLER - routes by mode field
// ========================================================================

export type DiscardMode = "select" | "except_named" | "rightmost";

function rememberDiscardedCards(discarded: CardInstance[]): void {
  if (!discarded.length) return;
  state.lastDiscardedCosts = discarded.map(
    (card) => parseInt(String(card.cost), 10) || 0,
  );
  state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
  state.lastDiscardedTypes = discarded.map((card) => String(card.type || ""));
  state.lastDiscardedType = state.lastDiscardedTypes[0] || "";
}

/** Append one card to lastDiscarded* during multi-pick discard (reset on first pick). */
export function rememberDiscardedCardInBatch(
  card: CardInstance,
  resetBatch: boolean,
): void {
  if (resetBatch) {
    state.lastDiscardedCosts = [];
    state.lastDiscardedTypes = [];
  } else {
    if (!state.lastDiscardedCosts) state.lastDiscardedCosts = [];
    if (!state.lastDiscardedTypes) state.lastDiscardedTypes = [];
  }
  state.lastDiscardedCosts.push(parseInt(String(card.cost), 10) || 0);
  state.lastDiscardedTypes.push(String(card.type || ""));
  state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
  state.lastDiscardedType = state.lastDiscardedTypes[0] || "";
}

/**
 * Discard one hand card during a multi-pick target prompt.
 * History-safe: call only inside doAction for each pick.
 */
export function discardHandCardFromTargetPick(
  owner: Player,
  uid: string,
  opts: { resetBatch: boolean; sourceCard: CardInstance | null },
): CardInstance | null {
  const hand = getHand(state, owner);
  const grave = getGraveyard(state, owner);
  const idx = hand.findIndex((c) => c.uid === uid);
  if (idx === -1) return null;
  const [d] = hand.splice(idx, 1);
  if (!d) return null;
  d.cost_mod = 0;
  grave.push(d);
  bumpZoneVersion();
  rememberDiscardedCardInBatch(d, opts.resetBatch);
  addShadows(state, owner, 1);
  logEvent("discard", { owner, count: 1, uid: d.uid, multiPick: true });

  const fx = (d as any).on_discard;
  if (Array.isArray(fx) && fx.length) {
    runEffects(
      [
        {
          op: "with_source",
          source_uid: d.uid,
          effects: [...fx],
        } as Effect,
      ],
      owner,
      opts.sourceCard,
    );
  }
  return d;
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

    case "rightmost":
      handleDiscardRightmost(eff, owner);
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
  rejectUnsupportedPoolNarrowKeys(
    eff as Record<string, unknown>,
    'mode:"except_named"',
  );
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
    bumpZoneVersion();
    rememberDiscardedCards(discarded);
    logEvent("discard", { owner, count: discarded.length });
    addShadows(state, owner, discarded.length);
  }
}

/** Discard the rightmost card(s) in hand without opening selection UI. */
export function handleDiscardRightmost(eff: Effect, owner: Player): void {
  const n = Math.max(1, parseInt(String((eff as any).count ?? 1), 10));
  const hand = getHand(state, owner);
  const grave = getGraveyard(state, owner);
  const discarded: CardInstance[] = [];

  for (let i = 0; i < n && hand.length > 0; i++) {
    const removed = hand.pop();
    if (!removed) continue;
    removed.cost_mod = 0;
    grave.push(removed);
    discarded.push(removed);
  }

  if (discarded.length > 0) {
    bumpZoneVersion();
    rememberDiscardedCards(discarded);
    logEvent("discard", { owner, count: discarded.length, mode: "rightmost" });
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
  if (n <= 0 || hand.length === 0) {
    reportSelectFizzled({
      eff,
      owner,
      sourceCard,
      target: "ally:hand",
    });
    return;
  }

  const filterType = String((eff as any).filter?.type || "").toLowerCase();
  const pool = filterType
    ? hand.filter((card) => String(card.type).toLowerCase() === filterType)
    : [...hand];
  if (pool.length === 0) {
    reportSelectFizzled({ eff, owner, sourceCard, target: "ally:hand" });
    return;
  }
  const selectCount = Math.min(n, pool.length);

  if (
    trySetPendingTarget({
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
    } as any) === "fizzled"
  ) {
    return;
  }

  // mark with the correct flag and render
  highlightSelectable(pool); // sets __uiSelectable + render()
  return "pending";
}

// Legacy handleTransformInHand was removed - now handled by unified transform op with zone: "hand"
