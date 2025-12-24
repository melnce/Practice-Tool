// src/logic/effects/ops/transform.ts
import { state } from "../../../core/gameState.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { applyKeywordsFromList } from "../../core/keywords.js";

import { logEvent } from "../../../core/logger.js";
import { Player, CardInstance, Effect } from "../../../core/types.js";
import { getHand, getBoard } from "../../../core/playerHelpers.js";
import { resolveUid } from "../../../core/uidResolver.js";

// ========================================================================
// UNIFIED TRANSFORM HANDLER - routes by zone field
// ========================================================================

export type TransformZone = "board" | "hand" | "self";
// mode: "random" = pick one random card from filtered set
// mode: "all" = transform all cards matching filter (default for zone: hand)
// Note: spellboost threshold transforms are now handled by gate(spellboost_count) + transform
export type TransformMode = "all" | "random";

export interface TransformFilter {
  type?: string; // "Spell", "Follower", "Amulet"
  class?: string; // "Runecraft", "Swordcraft", etc
  cost?: { op: string; value: number };
}

export interface TransformSpec {
  zone?: TransformZone;
  mode?: TransformMode;
  into?: string;
  name?: string;
  filter?: TransformFilter;
  target_card_name?: string;
}

/**
 * Unified transform handler.
 *
 * zone: "board" (default) - transform selected/targeted card on board
 * zone: "hand" - transform cards in hand
 * zone: "self" - transform the source card itself
 *
 * mode: "all" (default) - transform all cards matching filter
 * mode: "random" - pick one random card from filter and transform
 * mode: "threshold" - handled by spellboost.ts (transform at spellboost count)
 *
 * filter: { type: "Spell" | "Follower", class: "...", cost: {...} }
 */
export function handleTransform(
  eff: Effect & TransformSpec,
  owner: Player,
  ctx: { sourceCard?: CardInstance | null; context?: any },
): void {
  // Zone is MANDATORY - no default
  if (!eff.zone) {
    console.warn("transform: zone field is mandatory (board, hand, self)");
    return;
  }
  const zone = eff.zone as TransformZone;
  const mode = (eff.mode || "all") as TransformMode;
  const into = String(
    eff.into || eff.name || eff.target_card_name || "",
  ).trim();

  if (!into && zone !== "hand") {
    console.warn("transform: missing target card name (into)");
    return;
  }

  switch (zone) {
    case "hand":
      if (mode === "random") {
        transformRandomInHand(eff, owner, into);
      } else {
        // all mode (default for hand)
        transformInHandByFilter(eff, owner);
      }
      return;

    case "self":
      if (ctx.sourceCard) {
        transformAnywhere(ctx.sourceCard, into);
      } else {
        console.warn("transform zone:self - no sourceCard in context");
      }
      return;

    case "board":
    default: {
      // Board transform - get target from context
      // Prefer UID-based targeting
      let t: CardInstance | null = null;

      if (ctx.context?.targetUids?.length) {
        // UID-only path
        t = resolveUid(ctx.context.targetUids[0]);
      }

      // Fallback to deprecated object refs
      if (!t) {
        t =
          ctx.context?.selectedCard ||
          ctx.context?.targetCard ||
          ctx.context?.targets?.[0] ||
          null;
      }

      if (t) {
        transformTarget(t, into);
      } else if (ctx.sourceCard && eff.target === "self") {
        transformTarget(ctx.sourceCard, into);
      } else {
        console.warn("transform: no target in context; use via select{...}");
      }
      return;
    }
  }
}

// ========================================================================
// INTERNAL TRANSFORM HELPERS
// ========================================================================

/**
 * Check if a card matches the filter criteria.
 */
function matchesFilter(card: CardInstance, filter: TransformFilter): boolean {
  if (!card) return false;

  // Check type filter (Spell, Follower, Amulet)
  if (filter.type && (card as any).type !== filter.type) {
    return false;
  }

  // Check class filter
  if (filter.class && (card as any).class !== filter.class) {
    return false;
  }

  // Check cost filter
  if (filter.cost) {
    const cardCost = parseInt(card.cost as any, 10) || 0;
    const filterValue = parseInt(String(filter.cost.value), 10) || 0;

    switch (filter.cost.op) {
      case "<":
        if (cardCost >= filterValue) return false;
        break;
      case "<=":
        if (cardCost > filterValue) return false;
        break;
      case ">":
        if (cardCost <= filterValue) return false;
        break;
      case ">=":
        if (cardCost < filterValue) return false;
        break;
      case "==":
        if (cardCost !== filterValue) return false;
        break;
      default:
        console.warn(`Unknown cost operator: ${filter.cost.op}`);
        return false;
    }
  }

  return true;
}

/**
 * Transform all cards in hand matching the filter.
 * mode: "all" (default)
 */
function transformInHandByFilter(eff: Effect & TransformSpec, owner: Player) {
  const hand = getHand(state, owner);
  const filter = eff.filter || {};
  const targetCardName = eff.into || eff.target_card_name;

  if (!targetCardName) {
    console.error("transform zone:hand requires 'into' or 'target_card_name'");
    return;
  }

  const cardTemplate = getCardDetails(targetCardName);
  if (!cardTemplate) {
    console.error(`Card template not found for: ${targetCardName}`);
    return;
  }

  for (let i = hand.length - 1; i >= 0; i--) {
    const card = hand[i];
    if (!card) continue;

    if (matchesFilter(card, filter)) {
      const newCard = {
        ...structuredClone(cardTemplate),
        uid: state.rng.makeUid("card_"),
      };
      logEvent("transformInHand", { owner, from: card.name, to: newCard.name });
      hand[i] = newCard as CardInstance;
    }
  }
}

/**
 * Transform one random card in hand matching the filter.
 * mode: "random"
 */
function transformRandomInHand(
  eff: Effect & TransformSpec,
  owner: Player,
  intoName: string,
) {
  const hand = getHand(state, owner);
  if (!hand?.length) return;

  const filter = eff.filter || {};

  // Get all cards matching the filter
  const candidates = hand.filter((c) => c && matchesFilter(c, filter));
  if (!candidates.length) return;

  // Pick one randomly
  const pick = state.rng.pick(candidates);
  if (!pick) return;
  const uid = pick.uid;

  // Transform in hand (preserves uid/cost_mod/etc.)
  transformHandTarget(pick, intoName);

  // If the original transformRandomSpellInHand set cost to 0, replicate that behavior
  // (This is specific to the Raio card behavior)
  const updated = getHand(state, owner).find(
    (c) => c && c.uid === uid,
  );
  if (!updated) return;

  const printed = parseInt(updated.cost as string, 10) || 0;
  const existingM = parseInt(String(updated.cost_mod || 0), 10) || 0;
  const current = printed + existingM;
  const delta = 0 - current; // bring to zero

  if (updated.base_cost === undefined) updated.base_cost = printed;
  updated.cost_mod = existingM + delta;
  updated.temp_cost_mod_until_eot =
    (parseInt(String(updated.temp_cost_mod_until_eot ?? 0), 10) || 0) + delta;
  logEvent("transformRandomInHand", { owner, to: intoName });
}

// ========================================================================
// EXISTING TRANSFORM FUNCTIONS (unchanged)
// ========================================================================
/** Locate which zone currently holds the card. */
function locateZone(target: CardInstance) {
  if (!target) return null;
  const firstBoard = getBoard(state, "first");
  const secondBoard = getBoard(state, "second");
  const firstHand = getHand(state, "first");
  const secondHand = getHand(state, "second");
  if (firstBoard?.includes(target)) return "firstBoard";
  if (secondBoard?.includes(target)) return "secondBoard";
  if (firstHand?.includes(target)) return "firstHand";
  if (secondHand?.includes(target)) return "secondHand";
  return null;
}

/**
 * Transform a card into another card by name.
 * Accepts board or hand targets. Keeps owner & uid. No enter/leave triggers.
 * For board followers, preserves attack/turn state (no free attack refresh).
 */
export function transformTarget(target: CardInstance, intoName: string) {
  if (!target || !intoName) {
    console.warn("transformTarget: missing target or intoName");
    return;
  }

  const zone = locateZone(target);

  // If it's in hand, delegate to hand transformer and return.
  if (zone === "firstHand" || zone === "secondHand") {
    return transformHandTarget(target, intoName);
  }

  if (zone !== "firstBoard" && zone !== "secondBoard") {
    console.warn("transformTarget: target not found on any board");
    return;
  }

  const board = getBoard(state, zone === "firstBoard" ? "first" : "second");
  const owner = zone === "firstBoard" ? "first" : "second";

  const base = getCardDetails(intoName);
  if (!base) {
    console.warn(`transformTarget: unknown card '${intoName}'`);
    return;
  }

  const idx = board.indexOf(target);
  if (idx === -1) {
    console.warn("transformTarget: target index not found");
    return;
  }

  // Clone new template and preserve identity
  const c: CardInstance = structuredClone(base);
  c.uid = target.uid;
  c.owner = owner;

  // Initialize basics depending on type
  if (c.type === "Follower") {
    c.attack = parseInt(String(c.attack)) || 0;
    c.defense = parseInt(String(c.defense)) || 0;
    if (c.base_attack == null) c.base_attack = c.attack;
    if (c.base_defense == null) c.base_defense = c.defense;
    if (c.peak_defense == null) c.peak_defense = c.defense;

    // Keywords set flags like hasRush/hasStorm/etc.
    applyKeywordsFromList(c);

    // Preserve turn/action state (no free swing refresh)
    const perTurnNew = Number.isFinite(c.attacks_per_turn)
      ? c.attacks_per_turn!
      : 1;
    const leftOld = Number.isFinite(target.attacks_left)
      ? target.attacks_left!
      : perTurnNew;

    c.justPlayed = target.justPlayed === true;
    c.hasAttacked = target.hasAttacked === true;
    c.attacks_per_turn = perTurnNew;
    c.attacks_left = Math.max(0, Math.min(perTurnNew, leftOld));
    c.can_attack = !!(
      target.can_attack &&
      (c.hasStorm || c.hasRush || !target.justPlayed)
    );
  } else if (c.type === "Amulet") {
    applyKeywordsFromList(c);
    if (c.hasCountdown) c.countdown = Number(c.countdown || 0);
  }

  // Replace in place; do not fire enter/leave triggers
  board.splice(idx, 1, c);
  logEvent("transformTarget", {
    owner,
    from: target.name,
    to: intoName,
    uid: target.uid,
  });
}

/**
 * Transform a selected card in hand into another card by name.
 * Keeps uid/owner and preserves hand-relevant modifiers (cost, spellboost).
 */
export function transformHandTarget(target: CardInstance, intoName: string) {
  if (!target || !intoName) {
    console.warn("transformHandTarget: missing target or intoName");
    return;
  }

  const zone = locateZone(target);
  if (zone !== "firstHand" && zone !== "secondHand") {
    console.warn("transformHandTarget: target not found in any hand");
    return;
  }

  const hand = getHand(state, zone === "firstHand" ? "first" : "second");
  const owner = zone === "firstHand" ? "first" : "second";

  const base = getCardDetails(intoName);
  if (!base) {
    console.warn(`transformHandTarget: unknown card '${intoName}'`);
    return;
  }

  const idx = hand.indexOf(target);
  if (idx === -1) {
    console.warn("transformHandTarget: target index not found in hand");
    return;
  }

  const c: CardInstance = structuredClone(base);
  c.uid = target.uid;
  c.owner = owner;

  // Preserve hand modifiers that affect cost/behavior while in hand
  if (target.cost_mod !== undefined) c.cost_mod = target.cost_mod;
  if (target.effectiveCost !== undefined)
    c.effectiveCost = target.effectiveCost;

  // Copy KeywordState relevant fields (spellboost)
  if (target.keywordState) {
    if (!c.keywordState) c.keywordState = {};
    if (target.keywordState.spellboostCount !== undefined) {
      c.keywordState.spellboostCount = target.keywordState.spellboostCount;
    }
  }

  // Minimal numeric init (hand preview may rely on these)
  c.attack = parseInt(String(c.attack)) || 0;
  c.defense = parseInt(String(c.defense)) || 0;

  hand.splice(idx, 1, c);
  logEvent("transformHandTarget", {
    owner,
    from: target.name,
    to: intoName,
    uid: target.uid,
  });
}

/** Convenience entry point that works for either board or hand. */
export function transformAnywhere(target: CardInstance, intoName: string) {
  const zone = locateZone(target);
  if (zone === "firstBoard" || zone === "secondBoard")
    return transformTarget(target, intoName);
  if (zone === "firstHand" || zone === "secondHand")
    return transformHandTarget(target, intoName);
  console.warn("transformAnywhere: target not found in board/hand");
}

// Legacy transformRandomSpellInHand was removed - now handled by:
// { op: "transform", zone: "hand", mode: "random", filter: { type: "Spell" }, into: "..." }















