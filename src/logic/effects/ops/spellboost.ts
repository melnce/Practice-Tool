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
import { isDev } from "../../../core/env.js";

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

function hasSpellboostKeyword(card: CardInstance): boolean {
  if (!Array.isArray(card?.keywords)) return false;
  for (const k of card.keywords) {
    if (typeof k === "string" && k.toLowerCase() === "spellboost") return true;
    if (typeof k === "object" && k?.name?.toLowerCase() === "spellboost")
      return true;
  }
  return false;
}

function readSpellboostCostFromKeywordObject(card: CardInstance): {
  reduceBy: number;
  minCost: number;
} | null {
  if (!Array.isArray(card.keywords)) return null;
  for (const k of card.keywords) {
    if (typeof k !== "object" || !k) continue;
    if (
      String((k as { name?: string }).name ?? "").toLowerCase() !== "spellboost"
    )
      continue;
    const kw = k as {
      reduceCostBy?: number;
      reduce_cost_by?: number;
      minCost?: number;
      min_cost?: number;
    };
    const hasCostSpec =
      kw.reduceCostBy != null ||
      kw.reduce_cost_by != null ||
      kw.minCost != null ||
      kw.min_cost != null;
    if (!hasCostSpec) return null;
    return {
      reduceBy: Number(kw.reduceCostBy ?? kw.reduce_cost_by ?? 1),
      minCost: Number(kw.minCost ?? kw.min_cost ?? 0),
    };
  }
  return null;
}

function getSpellboostCostReduction(card: CardInstance): {
  reduceBy: number;
  minCost: number;
} | null {
  const spec = card.keywordState?.spellboost;
  if (spec) {
    const reduceBy = Number(spec.reduceCostBy);
    if (!Number.isFinite(reduceBy) || reduceBy <= 0) return null;
    const minCost = Number(spec.minCost);
    return {
      reduceBy,
      minCost: Number.isFinite(minCost) ? minCost : 0,
    };
  }

  const fromKeyword = readSpellboostCostFromKeywordObject(card);
  if (fromKeyword && isDev()) {
    console.warn(
      `[spellboost] keywordState.spellboost missing for ${card.name} (${card.uid}); using raw keyword fallback`,
    );
  }
  return fromKeyword;
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
      if (hasSpellboostKeyword(targetCard)) {
        // increment counter first
        incSB(targetCard);

        const costReduction = getSpellboostCostReduction(targetCard);
        if (costReduction) {
          applySpellboostCostReduction(targetCard, costReduction.reduceBy);
          if (costReduction.minCost > 0) {
            const floor = costReduction.minCost;
            const current = parseInt(String(targetCard.cost), 10) || 0;
            if (current < floor) {
              targetCard.cost = floor;
            }
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
        if (!hasSpellboostKeyword(c)) continue;

        // increment counter first
        incSB(c);

        const costReduction = getSpellboostCostReduction(c);
        if (costReduction) {
          applySpellboostCostReduction(c, costReduction.reduceBy);
          if (costReduction.minCost > 0) {
            const floor = costReduction.minCost;
            const current = parseInt(String(c.cost), 10) || 0;
            if (current < floor) {
              c.cost = floor;
            }
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
