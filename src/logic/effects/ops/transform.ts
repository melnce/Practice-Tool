// src/logic/effects/ops/transform.ts
import { state } from "../../../core/gameState.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { applyKeywordsFromList } from "../../core/keywords.js";
import { normalizeCardStats } from "../../../core/cardStats.js";
import { normalizeInstanceEnteringHandAsCopy } from "./add_to_hand/normalizeHandCopy.js";
import { wantsRandomTargetPick } from "../../core/targeting/randomPick.js";

import { logEvent } from "../../../core/logger.js";
import type {
  Player,
  CardInstance,
  Effect,
} from "../../../core/types/index.js";
import {
  getHand,
  getBoard,
  getDeck,
  opponentOf,
} from "../../../core/playerHelpers.js";
import { getPool, highlightSelectable } from "../../core/targeting.js";
import { mergeEffectPoolCondition } from "../../core/targeting/poolCondition.js";
import { resolveUid } from "../../../core/uidResolver.js";
import {
  trySetPendingTarget,
  reportSelectFizzled,
} from "../../core/pendingTarget/index.js";
import { recomputeAttackFlags } from "../../core/combat.js";
import { bumpZoneVersion } from "../../core/triggers/utils.js";

// ========================================================================
// UNIFIED TRANSFORM HANDLER - target field REQUIRED
// ========================================================================

export type TransformZone = "board" | "hand" | "deck" | "self";
export type TransformMode = "all" | "random";

export interface TransformFilter {
  type?: string;
  class?: string;
  name?: string;
  cost?: { op: string; value: number };
}

export interface TransformSpec {
  target: string; // REQUIRED: unified target (e.g., "enemy:follower", "ally:hand")
  mode?: TransformMode;
  into?: string; // REQUIRED for board/self unless into_source
  /**
   * Destination from a live zone instead of a fixed `into` name.
   * - string `"enemy:deck"`: Encroached World — exact-copy one random enemy deck follower.
   * - object: Round 4+ board transforms (e.g. Grandeur) — pick destination card(s) from a zone.
   */
  into_source?:
    | string
    | {
        zone: string;
        filter?: unknown;
        pick?: { count?: number | string; random?: boolean; unique?: boolean };
        /** When true, each selected board target gets its own independently resolved destination card. */
        per_target?: boolean;
      };
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
 *   { "op": "transform", "target": "ally:deck", "filter": { "name": "X" }, "into": "Y" }
 *
 * Zone derivation from target:
 *   - target contains ":hand" → zone = "hand"
 *   - target contains ":deck" → zone = "deck"
 *   - target === "self" → zone = "self"
 *   - otherwise → zone = "board"
 */
export function handleTransform(
  eff: Effect & TransformSpec,
  owner: Player,
  ctx: {
    sourceCard?: CardInstance | null;
    context?: any;
    effectsQueue?: Effect[];
  },
): "pending" | void {
  // ========================================================================
  // STRICT: target field is REQUIRED
  // ========================================================================
  if (!eff.target) {
    throw new Error(
      `[transform] Missing required field: "target". ` +
        `Use "enemy:follower", "ally:hand", "ally:deck", or "self". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  const targetStr = String(eff.target).toLowerCase();
  let zone: TransformZone;

  if (targetStr.includes(":hand")) {
    zone = "hand";
  } else if (targetStr.includes(":deck")) {
    zone = "deck";
  } else if (targetStr === "self") {
    zone = "self";
  } else {
    zone = "board";
  }

  const into = String(eff.into || eff.name || "").trim();
  const intoSourceRaw = (eff as any).into_source;
  const intoSource =
    typeof intoSourceRaw === "string" ? intoSourceRaw.toLowerCase().trim() : "";
  const hasIntoSourceObject =
    !!intoSourceRaw && typeof intoSourceRaw === "object";

  if (
    !into &&
    !intoSource &&
    !hasIntoSourceObject &&
    zone !== "hand" &&
    zone !== "deck"
  ) {
    throw new Error(
      `[transform] Missing required field: "into" or "into_source". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // Exact-copy transform into a sampled zone instance (Encroached World)
  if (intoSource === "enemy:deck") {
    if (ctx.context?.targetUids?.length) {
      for (const uid of ctx.context.targetUids) {
        const t = resolveUid(uid);
        if (t) transformIntoExactFromEnemyDeck(t, owner);
      }
      return;
    }
    if (zone === "self" && ctx.sourceCard) {
      transformIntoExactFromEnemyDeck(ctx.sourceCard, owner);
      return;
    }

    const selectN = parseInt(String(eff.select ?? 0), 10) || 0;
    const pool = getPool(
      eff.target || "ally:hand",
      owner,
      ctx.sourceCard ?? null,
      (eff as any).condition,
      {
        ...(ctx.context ?? {}),
        isTargetedEffect: selectN > 0,
      },
    );

    // Flat transform+select must open a hand prompt (mirror returnHandToDeck).
    // Empty pool: do not open an empty prompt — no-op like today's slice.
    if (selectN > 0) {
      if (!pool.length) {
        reportSelectFizzled({
          eff,
          owner,
          sourceCard: ctx.sourceCard ?? null,
          target: eff.target,
        });
        return;
      }
      const resume = ctx.effectsQueue ? Array.from(ctx.effectsQueue) : [];
      if (ctx.effectsQueue) ctx.effectsQueue.length = 0;
      if (
        trySetPendingTarget({
          eff,
          owner,
          sourceCard: ctx.sourceCard ?? null,
          resumeEffects: resume,
          pool,
          targets: [],
          selectCount: selectN,
        }) === "fizzled"
      ) {
        if (ctx.effectsQueue) ctx.effectsQueue.push(...resume);
        return;
      }
      highlightSelectable(pool);
      return "pending";
    }

    // selectN === 0 → AoE-style: transform the whole pool, no prompt
    for (const t of pool) {
      transformIntoExactFromEnemyDeck(t, owner);
    }
    return;
  }

  switch (zone) {
    case "hand":
      if (wantsRandomTargetPick(eff as Record<string, unknown>)) {
        transformRandomInHand(eff, owner, into);
      } else {
        return transformInHandByFilter(eff, owner, ctx);
      }
      return;

    case "deck":
      transformInDeckByFilter(eff, owner);
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
      const wantAll =
        String((eff as any).distribution || "").toLowerCase() === "all" ||
        targetStr.startsWith("all:") ||
        targetStr === "all:follower";

      const pool = getPool(
        eff.target || "ally:follower",
        owner,
        ctx.sourceCard ?? null,
        mergeEffectPoolCondition(eff),
        {
          ...(ctx.context ?? {}),
          isTargetedEffect: selectN > 0 && !wantAll,
        },
      );
      let targets = pool.filter((c) => c && c.type === "Follower");
      if ((eff as any).exclude_self && ctx.sourceCard) {
        targets = targets.filter((c) => c.uid !== ctx.sourceCard?.uid);
      }

      // into_source: sample transform destination from a zone (per-target RNG)
      const intoSource = (eff as any).into_source;
      if (intoSource && typeof intoSource === "object") {
        transformBoardFromSource(targets, owner, intoSource);
        return;
      }

      if (!into) {
        throw new Error(
          `[transform] Missing required field: "into" (or into_source). ` +
            `Effect: ${JSON.stringify(eff)}`,
        );
      }

      if (wantAll) {
        for (const t of targets) transformTarget(t, into);
        return;
      }

      if (selectN > 0 && !ctx.context?.targetUids?.length) {
        if (!targets.length) {
          reportSelectFizzled({
            eff,
            owner,
            sourceCard: ctx.sourceCard ?? null,
            target: eff.target,
          });
          return;
        }
        const resume = ctx.effectsQueue ? Array.from(ctx.effectsQueue) : [];
        if (ctx.effectsQueue) ctx.effectsQueue.length = 0;
        const selectCount = Math.min(selectN, targets.length);
        if (
          trySetPendingTarget({
            eff: { ...eff, op: "transform", into },
            owner,
            sourceCard: ctx.sourceCard ?? null,
            resumeEffects: resume,
            pool: targets,
            targets: [],
            selectCount,
          }) === "fizzled"
        ) {
          if (ctx.effectsQueue) ctx.effectsQueue.push(...resume);
          return;
        }
        highlightSelectable(targets);
        return "pending";
      }

      // Board transform - UID-based targeting only
      if (!ctx.context?.targetUids?.length) {
        if (ctx.sourceCard && (eff.target === "self" || targetStr === "self")) {
          transformTarget(ctx.sourceCard, into);
        } else if (targets.length && selectN === 0) {
          // AoE-style: transform entire matching pool when no select requested
          for (const t of targets) transformTarget(t, into);
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

/** Exact-copy transform: replace target with a clone of a random enemy deck card. */
function transformIntoExactFromEnemyDeck(
  target: CardInstance,
  owner: Player,
): void {
  const deck = getDeck(state, opponentOf(owner)) || [];
  if (!deck.length || !target) return;
  const src = deck[state.rng.nextInt(deck.length)];
  if (!src) return;

  const zone = locateZone(target);
  const clone: CardInstance = structuredClone(src);
  clone.uid = target.uid;
  if (target.owner) clone.owner = target.owner;
  if (target.zone) clone.zone = target.zone;
  else if (zone === "firstHand" || zone === "secondHand") clone.zone = "hand";
  else if (zone === "firstBoard" || zone === "secondBoard")
    clone.zone = "board";

  if (zone === "firstHand" || zone === "secondHand") {
    normalizeInstanceEnteringHandAsCopy(clone);
    normalizeCardStats(clone);
    const hand = getHand(state, zone === "firstHand" ? "first" : "second");
    const idx = hand.indexOf(target);
    if (idx !== -1) {
      hand[idx] = clone;
      logEvent("transformHandExact", {
        owner,
        from: target.name,
        to: clone.name,
        uid: target.uid,
      });
    }
    return;
  }

  if (zone === "firstBoard" || zone === "secondBoard") {
    normalizeCardStats(clone);
    applyKeywordsFromList(clone);
    const board = getBoard(state, zone === "firstBoard" ? "first" : "second");
    const idx = board.indexOf(target);
    if (idx !== -1) {
      board[idx] = clone;
      logEvent("transformExact", {
        owner,
        from: target.name,
        to: clone.name,
        uid: target.uid,
      });
    }
  }
}

// ========================================================================
// INTERNAL TRANSFORM HELPERS
// ========================================================================

/**
 * Transform each board target into a random card sampled from a source zone.
 * Each target gets an independent RNG roll (per_target defaults true).
 *
 * into_source: {
 *   zone: "ally:deck",
 *   filter: { type: "Follower" },
 *   pick: "random",
 *   per_target: true
 * }
 */
function transformBoardFromSource(
  targets: CardInstance[],
  owner: Player,
  intoSource: Record<string, any>,
): void {
  const zoneRaw = String(intoSource.zone || "ally:deck").toLowerCase();
  const sourceOwner: Player = zoneRaw.includes("enemy")
    ? owner === "first"
      ? "second"
      : "first"
    : owner;
  const sourceDeck = getDeck(state, sourceOwner);
  const filter = intoSource.filter || {};
  const perTarget = intoSource.per_target !== false;

  const candidates = sourceDeck.filter((c) => c && matchesFilter(c, filter));
  if (!candidates.length || !targets.length) return;

  if (!perTarget) {
    const pick = candidates[state.rng.nextInt(candidates.length)];
    if (!pick) return;
    for (const t of targets) transformTarget(t, String(pick.name));
    return;
  }

  for (const t of targets) {
    // Re-read live deck each roll so identity stays faithful if deck mutates;
    // for Grandeur the deck is unchanged, but rolls remain independent.
    const live = getDeck(state, sourceOwner).filter(
      (c) => c && matchesFilter(c, filter),
    );
    if (!live.length) continue;
    const pick = live[state.rng.nextInt(live.length)];
    if (!pick) continue;
    transformTarget(t, String(pick.name));
  }
}

/**
 * Check if a card matches the filter criteria.
 */
function matchesFilter(card: CardInstance, filter: any): boolean {
  if (!card) return false;

  // Check type filter (Spell, Follower, Amulet)
  if (filter.type && (card as any).type !== filter.type) {
    return false;
  }

  // Check tribe filter
  if (filter.tribe) {
    const want = String(filter.tribe).toLowerCase();
    const tribes = Array.isArray(card.tribes)
      ? card.tribes.map((t) => String(t).toLowerCase())
      : [];
    if (!tribes.includes(want)) return false;
  }

  // Check class filter (case-insensitive via shared evaluator semantics)
  if (filter.class) {
    const want = String(filter.class).toLowerCase();
    const have = String((card as any).class || "").toLowerCase();
    if (have !== want) return false;
  }

  // Check exact name filter
  if (filter.name && String(card.name) !== String(filter.name)) {
    return false;
  }

  const cardCost = parseInt(card.cost as any, 10) || 0;

  // Check flat cost filters - support both snake_case (cost_lte) and camelCase (costLte)
  const costLte = filter.cost_lte ?? filter.costLte;
  const costGte = filter.cost_gte ?? filter.costGte;
  const costEq = filter.cost_eq ?? filter.costEq;

  if (costLte !== undefined) {
    const maxCost = parseInt(String(costLte), 10);
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
 * Transform cards in hand matching the filter.
 * When `select` is set, builds a selection pool and pauses for user pick.
 * Otherwise transforms every matching card (AoE hand transform).
 */
function transformInHandByFilter(
  eff: Effect & TransformSpec,
  owner: Player,
  ctx: {
    sourceCard?: CardInstance | null;
    context?: any;
    effectsQueue?: Effect[];
  },
): "pending" | void {
  const targetCardName = eff.into || eff.name;
  if (!targetCardName) {
    console.error("transform zone:hand requires 'into' or 'name'");
    return;
  }

  const cardTemplate = getCardDetails(targetCardName);
  if (!cardTemplate) {
    console.error(`Card template not found for: ${targetCardName}`);
    return;
  }

  const selectN = parseInt(String(eff.select ?? 0), 10) || 0;

  if (selectN > 0) {
    const pool = getPool(
      eff.target || "ally:hand",
      owner,
      ctx.sourceCard ?? null,
      mergeEffectPoolCondition(eff),
      {
        ...(ctx.context ?? {}),
        isTargetedEffect: true,
      },
    );

    if (ctx.context?.targetUids?.length) {
      for (const uid of ctx.context.targetUids) {
        const card = resolveUid(uid);
        if (card && pool.some((c) => c.uid === card.uid)) {
          transformHandTarget(card, targetCardName);
        }
      }
      return;
    }

    if (!pool.length) {
      reportSelectFizzled({
        eff,
        owner,
        sourceCard: ctx.sourceCard ?? null,
        target: eff.target,
      });
      return;
    }

    const selectCount = Math.min(selectN, pool.length);
    if (
      trySetPendingTarget({
        eff: { ...eff, op: "transform", into: targetCardName },
        owner,
        sourceCard: ctx.sourceCard ?? null,
        resumeEffects: ctx.effectsQueue ?? [],
        pool,
        targets: [],
        selectCount,
      }) === "fizzled"
    ) {
      return;
    }
    highlightSelectable(pool);
    return "pending";
  }

  const hand = getHand(state, owner);
  const filter = eff.filter || {};
  for (let i = hand.length - 1; i >= 0; i--) {
    const card = hand[i];
    if (!card) continue;
    if (matchesFilter(card, filter)) {
      transformHandTarget(card, targetCardName);
    }
  }
}

/**
 * Transform all cards in deck matching the filter (same semantics as hand).
 */
function transformInDeckByFilter(eff: Effect & TransformSpec, owner: Player) {
  const deck = getDeck(state, owner);
  const filter = eff.filter || {};
  const targetCardName = eff.into || (eff as any).target_card_name;

  if (!targetCardName) {
    console.error("transform zone:deck requires 'into' or 'target_card_name'");
    return;
  }

  const cardTemplate = getCardDetails(targetCardName);
  if (!cardTemplate) {
    console.error(`Card template not found for: ${targetCardName}`);
    return;
  }

  for (let i = deck.length - 1; i >= 0; i--) {
    const card = deck[i];
    if (!card) continue;
    if (!matchesFilter(card, filter)) continue;
    const newCard = {
      ...structuredClone(cardTemplate),
      uid: card.uid,
      owner: card.owner,
      zone: card.zone ?? "deck",
    };
    logEvent("transformInDeck", { owner, from: card.name, to: newCard.name });
    deck[i] = newCard as CardInstance;
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

  // Transform in hand (preserves uid/cost_mod/etc.)
  transformHandTarget(pick, intoName);

  // Temporary cost-0 (Raio et al.) is authored as a follow-up `cost` set+until_eot —
  // do not hardcode it here or every random hand transform silently gets free cost.
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
 * For board followers, resets turn/action state (transform is a new card).
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

    // Fresh turn state — transform is a new card (no inherited attack/act flags).
    const perTurnNew = Number.isFinite(c.attacks_per_turn)
      ? c.attacks_per_turn!
      : 1;

    c.justPlayed = true;
    c.hasAttacked = false;
    c.attacks_per_turn = perTurnNew;
    c.attacks_left = perTurnNew;
    c.attacks_used_this_turn = 0;
    recomputeAttackFlags(c);
  } else if (c.type === "Amulet") {
    applyKeywordsFromList(c);
    if (c.hasCountdown) c.countdown = Number(c.countdown || 0);
    if (!c.keywordState) c.keywordState = {};
    c.keywordState.engagedThisTurn = false;
  }

  // Replace in place; do not fire enter/leave triggers
  board.splice(idx, 1, c);
  bumpZoneVersion();
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
  bumpZoneVersion();
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
