// src/logic/effects/ops/transform.ts
import { state } from "../../../core/gameState.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { applyKeywordsFromList } from "../../core/keywords.js";

import { logEvent } from "../../../core/logger.js";
import type {
  Player,
  CardInstance,
  Effect,
} from "../../../core/types/index.js";
import { getHand, getBoard } from "../../../core/playerHelpers.js";
import { getPool } from "../../core/targeting.js";
import { resolveUid } from "../../../core/uidResolver.js";

// ========================================================================
// UNIFIED TRANSFORM HANDLER - target field REQUIRED
// ========================================================================

export type TransformZone = "board" | "hand" | "self";
export type TransformMode = "all" | "random";

export interface TransformFilter {
  type?: string;
  class?: string;
  cost?: { op: string; value: number };
}

export interface TransformSpec {
  target: string; // REQUIRED: unified target (e.g., "enemy:follower", "ally:hand")
  mode?: TransformMode;
  into?: string; // REQUIRED for board/self
  name?: string;
  filter?: TransformFilter;
  select?: number;
}

/**
 * Unified transform handler.
 *
 * CANONICAL FORMAT (target field REQUIRED):
 *   { "op": "transform", "target": "enemy:follower", "select": 1, "into": "Fairy" }
 *   { "op": "transform", "target": "ally:hand", "filter": {...}, "into": "Token" }
 *
 * Zone derivation from target:
 *   - target contains ":hand" → zone = "hand"
 *   - target === "self" → zone = "self"
 *   - otherwise → zone = "board"
 */
export function handleTransform(
  eff: Effect & TransformSpec,
  owner: Player,
  ctx: { sourceCard?: CardInstance | null; context?: any },
): void {
  // ========================================================================
  // STRICT: target field is REQUIRED
  // ========================================================================
  if (!eff.target) {
    throw new Error(
      `[transform] Missing required field: "target". ` +
        `Use "enemy:follower", "ally:hand", or "self". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  const targetStr = String(eff.target).toLowerCase();
  let zone: TransformZone;

  if (targetStr.includes(":hand")) {
    zone = "hand";
  } else if (targetStr === "self") {
    zone = "self";
  } else {
    zone = "board";
  }

  const mode = (eff.mode || "all") as TransformMode;
  const into = String(eff.into || eff.name || "").trim();

  if (!into && zone !== "hand") {
    throw new Error(
      `[transform] Missing required field: "into". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
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
      const selectN = parseInt(String(eff.select ?? 0), 10) || 0;
      if (selectN > 0 && !ctx.context?.targetUids?.length) {
        const pool = getPool(
          eff.target || "ally:follower",
          owner,
          ctx.sourceCard ?? null,
          eff.condition,
          ctx.context ?? {},
        );
        if (pool.length > 0) {
          const picks = pool.slice(0, Math.min(selectN, pool.length));
          for (const t of picks) transformTarget(t, into);
          return;
        }
      }

      // Board transform - UID-based targeting only
      if (!ctx.context?.targetUids?.length) {
        if (ctx.sourceCard && (eff.target === "self" || targetStr === "self")) {
          transformTarget(ctx.sourceCard, into);
        } else {
          console.warn("transform: no targetUids in context.");
        }
        return;
      }
      const t = resolveUid(ctx.context.targetUids[0]);
      if (t) {
        transformTarget(t, into);
      } else {
        console.warn("transform: could not resolve target from UID.");
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
function matchesFilter(card: CardInstance, filter: any): boolean {
  if (!card) return false;

  // DEBUG: Log filter check
  console.log("[matchesFilter DEBUG]", {
    cardName: card.name,
    cardCost: card.cost,
    cardClass: (card as any).class,
    filter: JSON.stringify(filter),
  });

  // Check type filter (Spell, Follower, Amulet)
  if (filter.type && (card as any).type !== filter.type) {
    return false;
  }

  // Check class filter
  if (filter.class && (card as any).class !== filter.class) {
    return false;
  }

  const cardCost = parseInt(card.cost as any, 10) || 0;

  // Check flat cost filters - support both snake_case (cost_lte) and camelCase (costLte)
  const costLte = filter.cost_lte ?? filter.costLte;
  const costGte = filter.cost_gte ?? filter.costGte;
  const costEq = filter.cost_eq ?? filter.costEq;

  if (costLte !== undefined) {
    const maxCost = parseInt(String(costLte), 10);
    console.log("[matchesFilter DEBUG] cost_lte check:", {
      cardName: card.name,
      cardCost,
      maxCost,
      willReject: cardCost > maxCost,
    });
    if (cardCost > maxCost) return false;
  }

  if (costGte !== undefined) {
    const minCost = parseInt(String(costGte), 10);
    if (cardCost < minCost) return false;
  }

  if (costEq !== undefined) {
    const exactCost = parseInt(String(costEq), 10);
    if (cardCost !== exactCost) return false;
  }

  // Check nested cost filter (legacy format: cost: { op: "<=", value: 2 })
  if (filter.cost && typeof filter.cost === "object") {
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
 * Preserves UID, owner, and zone to maintain card identity.
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
      // PRESERVE UID, owner, zone - only replace card properties
      const newCard = {
        ...structuredClone(cardTemplate),
        uid: card.uid, // PRESERVE original UID
        owner: card.owner, // PRESERVE owner
        zone: card.zone, // PRESERVE zone
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
  const updated = getHand(state, owner).find((c) => c && c.uid === uid);
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
  if ((target as any).insertionTs != null) {
    (c as any).insertionTs = (target as any).insertionTs;
  }

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
