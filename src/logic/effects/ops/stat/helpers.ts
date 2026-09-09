/**
 * Pure helper functions for stat operations.
 * Extracted from handleStatOrchestrator for single responsibility.
 */
import { state } from "../../../../core/gameState.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";
import { STAT_ACTION_VALUES } from "./types.js";
import { isDev } from "../../../../core/env.js";
import { readEnv } from "../../../../core/env.js";
import { logEvent } from "../../../../core/logger.js";
import {
  getPlaysThisTurn,
  getHand,
  getDeck,
  getHP,
  setHP,
  getMaxHP,
  setMaxHP,
} from "../../../../core/playerHelpers.js";
import { mergeEffectPoolCondition } from "../../../core/targeting/poolCondition.js";
import {
  evaluateCardCondition,
  assertKnownCardConditionKeys,
} from "../../../core/conditions/evaluator.js";
import { normalizeStatSpec, statOpHasKeywordOrAttacksGrant } from "./spec.js";
import { resolveStatDuration } from "./duration.js";
import { applyStatBuff } from "./core.js";

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export function validateStatOp(eff: StatOp): void {
  const hasMode = !!(eff as any).mode;
  const hasAction = !!eff.action;
  const hasTarget = eff.target !== undefined;

  if (hasAction && !hasMode && !STAT_ACTION_VALUES.has(String(eff.action))) {
    const msg = `[stat] Unknown action "${eff.action}"`;
    if (isDev()) {
      throw new Error(msg);
    }
    console.warn(msg);
  }

  if (!hasMode && !hasAction) {
    throw new Error(
      `[stat] Missing required field: "action". Must be "give" or "set". Effect: ${JSON.stringify(eff)}`,
    );
  }

  if (!hasMode && !hasTarget) {
    throw new Error(
      `[stat] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Special Modes
// -----------------------------------------------------------------------------

export function getComboCount(owner: Player): number {
  return getPlaysThisTurn(state, owner);
}

// -----------------------------------------------------------------------------
// Special Targets Detection
// -----------------------------------------------------------------------------

export type SpecialTarget =
  | "self"
  | "ally:leader"
  | "enemy:leader"
  | "hand"
  | "ally:deck"
  | "last_added_to_hand"
  | "entering_follower"
  | null;

export function detectSpecialTarget(eff: StatOp): SpecialTarget {
  const target = String(eff.target || "").toLowerCase();

  if (target === "self") return "self";
  if (target === "ally:leader") return "ally:leader";
  if (target === "enemy:leader") return "enemy:leader";
  if (target === "hand") return "hand";
  if (target === "ally:deck" || target === "deck") return "ally:deck";
  if (target === "last_added_to_hand") return "last_added_to_hand";
  if (target === "entering_follower") return "entering_follower";

  return null;
}

// -----------------------------------------------------------------------------
// Leader Stat Handling
// -----------------------------------------------------------------------------

export function applyLeaderStat(
  targetOwner: Player,
  action: string | undefined,
  defense: number,
): void {
  if (action === "set") {
    setMaxHP(state, targetOwner, defense);
    setHP(state, targetOwner, Math.min(getHP(state, targetOwner), defense));
    logEvent("setLeaderMaxHP", { owner: targetOwner, maxHP: defense });
  } else if (action === "give" || !action) {
    // Relative change to max defense (e.g. Lhynkal crest −2)
    const curMax = getMaxHP(state, targetOwner);
    const next = Math.max(1, curMax + defense);
    setMaxHP(state, targetOwner, next);
    setHP(state, targetOwner, Math.min(getHP(state, targetOwner), next));
    logEvent("modifyLeaderMaxHP", {
      owner: targetOwner,
      delta: defense,
      maxHP: next,
    });
  }
}

// -----------------------------------------------------------------------------
// Zone route guards (BN3–BN5, BN7)
// -----------------------------------------------------------------------------

const warnedZoneStatKeywords = new Set<string>();
const warnedZoneStatDuration = new Set<string>();
const warnedZoneStatSet = new Set<string>();
const warnedZoneStatLastAddedFilter = new Set<string>();

export type ZoneStatRouteLabel = "hand" | "deck" | "last_added_to_hand";

function rejectZoneStatFeature(
  active: boolean,
  warned: Set<string>,
  warnKey: string,
  msg: string,
): void {
  if (!active) return;
  if (readEnv("NODE_ENV") === "test") {
    throw new Error(msg);
  }
  if (!warned.has(warnKey)) {
    console.warn(msg);
    warned.add(warnKey);
  }
}

/** BN3: keyword grants are not supported on zone stat routes. */
export function rejectZoneStatKeywords(
  eff: StatOp,
  routeLabel: ZoneStatRouteLabel,
): void {
  if (!statOpHasKeywordOrAttacksGrant(eff)) return;
  rejectZoneStatFeature(
    true,
    warnedZoneStatKeywords,
    `${routeLabel}:keywords`,
    `[stat] keywords/attacks_per_turn are not supported on route ${routeLabel}. ` +
      `Effect: ${JSON.stringify(eff)}`,
  );
}

/**
 * BN4: temporary stat duration is not supported on zone routes — clearTemporaryBuffs
 * only runs for board cards at end-of-turn (turnBoundary.ts), never for hand/deck.
 */
export function rejectZoneStatDuration(
  eff: StatOp,
  routeLabel: ZoneStatRouteLabel,
): void {
  if (resolveStatDuration(eff) === "permanent") return;
  rejectZoneStatFeature(
    true,
    warnedZoneStatDuration,
    `${routeLabel}:duration`,
    `[stat] duration keys are not supported on route ${routeLabel}. ` +
      `Effect: ${JSON.stringify(eff)}`,
  );
}

/** BN5: action:"set" would silently add on zone routes — reject loudly. */
export function rejectZoneStatSet(
  eff: StatOp,
  routeLabel: ZoneStatRouteLabel,
): void {
  if (eff.action !== "set") return;
  rejectZoneStatFeature(
    true,
    warnedZoneStatSet,
    `${routeLabel}:set`,
    `[stat] action:"set" is not supported on route ${routeLabel}. ` +
      `Effect: ${JSON.stringify(eff)}`,
  );
}

/** BN7: last_added_to_hand already names its target — filter/condition is misleading. */
export function rejectZoneStatLastAddedFilter(eff: StatOp): void {
  const merged = mergeEffectPoolCondition(eff);
  if (Object.keys(merged).length === 0) return;
  rejectZoneStatFeature(
    true,
    warnedZoneStatLastAddedFilter,
    "last_added_to_hand:filter",
    `[stat] filter/condition is not supported on route last_added_to_hand. ` +
      `Effect: ${JSON.stringify(eff)}`,
  );
}

function guardZoneStatOp(eff: StatOp, routeLabel: ZoneStatRouteLabel): void {
  rejectZoneStatKeywords(eff, routeLabel);
  rejectZoneStatDuration(eff, routeLabel);
  rejectZoneStatSet(eff, routeLabel);
  if (routeLabel === "last_added_to_hand") {
    rejectZoneStatLastAddedFilter(eff);
  }
}

// -----------------------------------------------------------------------------
// Zone filter matching (BN6)
// -----------------------------------------------------------------------------

function matchesZoneStatFilter(card: CardInstance, eff: StatOp): boolean {
  if (card.type !== "Follower") return false;
  const merged = mergeEffectPoolCondition(eff);
  if (Object.keys(merged).length === 0) return true;
  assertKnownCardConditionKeys(merged, "zone-stat-filter");
  return evaluateCardCondition(card, merged);
}

function applyZoneStatDelta(
  card: CardInstance,
  a: number,
  d: number,
  owner: Player,
  logKind: "buffHand" | "buffDeck" | "buffLastAddedToHand",
): void {
  applyStatBuff(card, a, d, owner);
  if (logKind === "buffLastAddedToHand") {
    logEvent(logKind, { owner, name: card.name, uid: card.uid, a, d });
  } else {
    logEvent(logKind, { owner, target: card.name, uid: card.uid, a, d });
  }
}

// -----------------------------------------------------------------------------
// Hand Buff Handling
// -----------------------------------------------------------------------------

export function applyHandBuff(
  owner: Player,
  eff: StatOp,
  sourceCard: CardInstance | null = null,
): void {
  guardZoneStatOp(eff, "hand");
  const { attack: a, defense: d } = normalizeStatSpec(eff, {
    owner,
    sourceCard,
  });
  if (a === 0 && d === 0) return;

  const hand = getHand(state, owner);
  for (const card of hand) {
    if (!matchesZoneStatFilter(card, eff)) continue;
    applyZoneStatDelta(card, a, d, owner, "buffHand");
  }
}

/** Buff follower instances in the owner's deck (Thestae crest). Persists on draw. */
export function applyDeckBuff(
  owner: Player,
  eff: StatOp,
  sourceCard: CardInstance | null = null,
): void {
  guardZoneStatOp(eff, "deck");
  const { attack: a, defense: d } = normalizeStatSpec(eff, {
    owner,
    sourceCard,
  });
  if (a === 0 && d === 0) return;

  const deck = getDeck(state, owner);
  for (const card of deck) {
    if (!matchesZoneStatFilter(card, eff)) continue;
    applyZoneStatDelta(card, a, d, owner, "buffDeck");
  }
}

// -----------------------------------------------------------------------------
// Last Added To Hand Buff
// -----------------------------------------------------------------------------

export function applyLastAddedToHandBuff(
  owner: Player,
  eff: StatOp,
  sourceCard: CardInstance | null = null,
): void {
  guardZoneStatOp(eff, "last_added_to_hand");
  const card = state.lastAddedToHand;
  if (!card) return;

  const { attack: a, defense: d } = normalizeStatSpec(eff, {
    owner,
    sourceCard,
  });
  if (a === 0 && d === 0) return;

  applyZoneStatDelta(card, a, d, owner, "buffLastAddedToHand");
}

// -----------------------------------------------------------------------------
// Random Selection
// -----------------------------------------------------------------------------

export function pickRandomFromPool(
  pool: CardInstance[],
  count: number,
): CardInstance[] {
  if (count <= 0) return [];

  const chosen: CardInstance[] = [];
  const bag = [...pool];

  for (let i = 0; i < count && bag.length; i++) {
    const idx = state.rng.nextInt(bag.length);
    const picked = bag.splice(idx, 1)[0];
    if (picked) chosen.push(picked);
  }

  return chosen;
}
