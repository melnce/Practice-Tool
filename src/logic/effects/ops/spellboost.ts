// src/logic/effects/ops/spellboost.ts
import { state } from "../../../core/gameState.js";
// Legacy spellboost transform removed: getCardDetails import no longer needed

import { logEvent } from "../../../core/logger.js";
import type {
  Player,
  CardInstance,
  Effect,
} from "../../../core/types/index.js";
import { getHand } from "../../../core/playerHelpers.js";
import { runEffects } from "../../core/effects/index.js";
import { handleStat } from "./stat.js";
import { handleCost } from "./cost/unified.js";
import { applySpellboostCostReduction } from "./cost/model.js";

/* ------------------------ helpers ------------------------ */

function incSB(card: CardInstance) {
  if (!card) return;
  if (!card.keywordState) card.keywordState = {};
  const hasKS = typeof card.keywordState.spellboostCount === "number";
  const val =
    (hasKS ? card.keywordState.spellboostCount! : card.spellboostCount || 0) +
    1;

  card.keywordState.spellboostCount = val;
  card.spellboostCount = val; // Legacy sync for UI/Values
}

function getSpellboostKeyword(card: CardInstance) {
  if (!Array.isArray(card?.keywords)) return null;
  for (const k of card.keywords) {
    if (typeof k === "string" && k.toLowerCase() === "spellboost")
      return { name: "Spellboost" };
    if (typeof k === "object" && k?.name?.toLowerCase() === "spellboost")
      return k;
  }
  return null;
}

function normTimes(x: any) {
  if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
  if (x && typeof x === "object") {
    const n = parseInt(x.times ?? x.count ?? 1, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  return 1;
}

// Legacy transformSelfInHand was removed - now handled by:
// { op: "gate", condition: "spellboost_count", count: N, effects: [{ op: "transform", zone: "self", into: "..." }] }

/**
 * Handle all Spellboost keyword effects for ONE in-hand card.
 * All effects are passed to runEffects - gate conditions handle thresholds.
 */
function dispatchSpellboostKeywordEffect(
  owner: Player,
  card: CardInstance,
  effect: Effect,
) {
  // Stat/cost on self avoid the effects index cycle (index → buffs → spellboost → index).
  if (
    effect.op === "stat" &&
    String(effect.target ?? "").toLowerCase() === "self"
  ) {
    handleStat(effect, owner, card, []);
    return;
  }
  if (
    effect.op === "cost" &&
    String(effect.target ?? "").toLowerCase() === "self"
  ) {
    handleCost(effect, owner, card, {});
    return;
  }
  runEffects([effect], owner, card);
}

function handleSpellboostKeywordEffects(owner: Player, c: CardInstance) {
  const kws = Array.isArray(c.keywords) ? c.keywords : [];
  for (const kw of kws) {
    const name = String((kw as any)?.name ?? "").toLowerCase();
    if (name !== "spellboost" || !Array.isArray((kw as any).effects)) continue;

    for (const effect of (kw as any).effects as Effect[]) {
      dispatchSpellboostKeywordEffect(owner, c, effect);
    }
  }
}

export function handleSetSpellboostCount(eff: any, sourceCard: CardInstance) {
  if (!sourceCard) return;
  const val = parseInt(eff.amount ?? 0, 10) || 0;
  if (!sourceCard.keywordState) sourceCard.keywordState = {};
  sourceCard.keywordState.spellboostCount = val;
  sourceCard.spellboostCount = val; // Legacy sync

  // If setting to 0, visually clear it (UI might check for >0 or existing property)
  // Re-rendering happens periodically
}

/* ------------------------ main ------------------------ */

/**
 * spellboostHand
 * Supports both signatures:
 * - spellboostHand(owner, times = 1, targetCard = null)
 * - spellboostHand(owner, targetCard, times = 1)
 */
export function spellboostHand(
  owner: Player,
  times: any = 1,
  targetCard: any = null,
) {
  if (owner !== "first" && owner !== "second") return;

  // Signature normalization
  // If the second argument looks like a card (has uid), treat it as targetCard
  if (
    targetCard === null &&
    times &&
    typeof times === "object" &&
    "uid" in times
  ) {
    targetCard = times;
    times = 1;
  }
  // If third arg is actually a number, accept it as times
  if (typeof targetCard === "number" && Number.isFinite(targetCard)) {
    times = targetCard;
    targetCard = null;
  }

  const t = normTimes(times);
  const hand = getHand(state, owner);

  for (let i = 0; i < t; i++) {
    // --- Single-card spellboost path ---
    if (targetCard) {
      const kw = getSpellboostKeyword(targetCard);
      if (kw) {
        // increment counter first
        incSB(targetCard);

        // optional cost reduction (only if keyword specifies)
        if (Object.prototype.hasOwnProperty.call(kw, "reduceCostBy")) {
          const reduceBy: number = Number.isFinite(kw.reduceCostBy)
            ? Number(kw.reduceCostBy)
            : 0;
          if (reduceBy > 0) {
            applySpellboostCostReduction(targetCard, reduceBy);
          }
        }
        logEvent("spellboost", {
          owner,
          card: targetCard.name,
          uid: targetCard.uid,
          count: targetCard.keywordState?.spellboostCount,
          newCost: targetCard.cost,
        });

        // run in-hand effects for THIS card
        handleSpellboostKeywordEffects(owner, targetCard);
      }
    } else {
      // --- Whole-hand spellboost path ---
      for (const c of hand) {
        const kw = getSpellboostKeyword(c);
        if (!kw) continue;

        // increment counter first
        incSB(c);

        // optional cost reduction (opt-in per keyword)
        if (Object.prototype.hasOwnProperty.call(kw, "reduceCostBy")) {
          const reduceBy: number = Number.isFinite(kw.reduceCostBy)
            ? Number(kw.reduceCostBy)
            : 0;
          if (reduceBy > 0) {
            applySpellboostCostReduction(c, reduceBy);
          }
        }
        logEvent("spellboost", {
          owner,
          card: c.name,
          uid: c.uid,
          count: c.keywordState?.spellboostCount,
          newCost: c.cost,
        });

        // run in-hand effects for this card
        handleSpellboostKeywordEffects(owner, c);
      }
    }
  }

  // Render removed - UI layer
}
