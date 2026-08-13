/**
 * Pure helper functions for stat operations.
 * Extracted from handleStatOrchestrator for single responsibility.
 */
import { state } from "../../../../core/gameState.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";
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

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export function validateStatOp(eff: StatOp): void {
  const hasMode = !!(eff as any).mode;
  const hasAction = !!eff.action;
  const hasTarget = eff.target !== undefined;

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

export function isSpecialMode(eff: StatOp): boolean {
  const mode = (eff as any).mode;
  return mode === "combo_repeat" || mode === "double";
}

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
  } else if (action === "give" || action === "modify" || !action) {
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
// Hand Buff Handling
// -----------------------------------------------------------------------------

export function applyHandBuff(owner: Player, eff: StatOp): void {
  const hand = getHand(state, owner);
  const a = parseInt((eff.attack as any) ?? 0) || 0;
  const d = parseInt((eff.defense as any) ?? 0) || 0;

  for (const card of hand) {
    if (!matchesHandFilter(card, eff)) continue;

    if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
    card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
    card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
    card.attack = (parseInt(String(card.attack)) || 0) + a;
    card.defense = (parseInt(String(card.defense)) || 0) + d;

    logEvent("buffHand", { owner, target: card.name, uid: card.uid, a, d });
  }
}

/** Buff follower instances in the owner's deck (Thestae crest). Persists on draw. */
export function applyDeckBuff(owner: Player, eff: StatOp): void {
  const deck = getDeck(state, owner);
  const a = parseInt((eff.attack as any) ?? 0) || 0;
  const d = parseInt((eff.defense as any) ?? 0) || 0;

  for (const card of deck) {
    if (!matchesHandFilter(card, eff)) continue;

    if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
    card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
    card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
    card.attack = (parseInt(String(card.attack)) || 0) + a;
    card.defense = (parseInt(String(card.defense)) || 0) + d;
    if (typeof card.peak_defense === "number") {
      card.peak_defense = Math.max(
        card.peak_defense,
        Number(card.defense) || 0,
      );
    } else {
      card.peak_defense = Number(card.defense) || 0;
    }

    logEvent("buffDeck", { owner, target: card.name, uid: card.uid, a, d });
  }
}

function matchesHandFilter(card: CardInstance, eff: StatOp): boolean {
  if (card.type !== "Follower") return false;
  const filter = (eff as any).filter;
  const typeFilter = filter?.type ?? (eff as any).type;
  if (typeFilter && String(typeFilter).toLowerCase() !== "follower") {
    // Explicit non-follower filter → no match (deck/hand buffs are follower-only today)
    if (String(typeFilter).toLowerCase() !== "card") return false;
  }
  if ((eff as any).class && card.class !== (eff as any).class) return false;
  if (
    (eff as any).tribe &&
    (!Array.isArray(card.tribes) || !card.tribes.includes((eff as any).tribe))
  )
    return false;
  if (eff.condition?.class && card.class !== eff.condition.class) return false;
  if (
    eff.condition?.tribe &&
    (!Array.isArray(card.tribes) || !card.tribes.includes(eff.condition.tribe))
  )
    return false;
  return true;
}

// -----------------------------------------------------------------------------
// Last Added To Hand Buff
// -----------------------------------------------------------------------------

export function applyLastAddedToHandBuff(owner: Player, eff: StatOp): void {
  const card = state.lastAddedToHand;
  if (!card) return;

  const a = parseInt((eff.attack as any) ?? 0) || 0;
  const d = parseInt((eff.defense as any) ?? 0) || 0;

  if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
  card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
  card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
  card.attack = (parseInt(String(card.attack)) || 0) + a;
  card.defense = (parseInt(String(card.defense)) || 0) + d;

  logEvent("buffLastAddedToHand", {
    owner,
    name: card.name,
    uid: card.uid,
    a,
    d,
  });
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
