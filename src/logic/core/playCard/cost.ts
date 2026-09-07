import type { CardInstance, Effect } from "../../../core/types/index.js";
import {
  getEffectivePlayCost,
  pickAlternateForm,
  type AlternateForm,
} from "../../../helpers/alternateForm.js";
import { getEffectiveCostValue } from "../../effects/ops/cost/model.js";
import { playerHasCrestPassive } from "../../effects/crest.js";
import { state } from "../../../core/gameState.js";

export function getEffectiveCost(card: CardInstance): number {
  return getEffectiveCostValue(card);
}

export function pickEnhanceTiers(
  card: CardInstance,
  availablePP: number,
): { cost: number; effects: Effect[] }[] {
  let tiers: { cost: number; effects: Effect[] }[] = Array.isArray(
    card.enhanceTiers,
  )
    ? card.enhanceTiers.map((t) => ({
        cost: t.cost,
        effects: t.effects || [],
      }))
    : [];
  if (!tiers.length && Array.isArray(card.keywords)) {
    tiers = [];
    for (const k of card.keywords) {
      const name = (typeof k === "string" ? k : k?.name) || "";
      if (name.toLowerCase() === "enhance") {
        const cost = Number(typeof k === "object" ? k.cost : 0);
        const effects =
          typeof k === "object" && Array.isArray(k.effects) ? k.effects : [];
        if (cost > 0) tiers.push({ cost, effects });
      }
    }
    tiers.sort((a, b) => b.cost - a.cost);
  }
  const affordable: { cost: number; effects: Effect[] }[] = [];
  for (const t of tiers) {
    if (availablePP >= t.cost) {
      affordable.push({ cost: t.cost, effects: t.effects || [] });
    }
  }
  affordable.sort((a, b) => a.cost - b.cost);
  return affordable;
}

/** @deprecated Use pickEnhanceTiers — returns highest affordable tier only. */
export function pickEnhanceTier(
  card: CardInstance,
  availablePP: number,
): { cost: number; effects: Effect[] } | null {
  const tiers = pickEnhanceTiers(card, availablePP);
  return tiers.length ? tiers[tiers.length - 1]! : null;
}

export type PlayCostMode = "enhance" | "normal" | "accelerate" | "crystallize";

export interface PlayCostPlan {
  mode: PlayCostMode;
  /** PP to spend for this play. */
  cost: number;
  /** All affordable Enhance tiers, ascending cost order. Empty when not enhancing. */
  enhanceTiers: { cost: number; effects: Effect[] }[];
  alternate: AlternateForm | null;
  /** Effective printed-form cost (base + hand mod). */
  effectivePlayCost: number;
}

/**
 * Resolve which form/cost a play will use.
 * Priority: Enhance (if affordable) → normal (if affordable) →
 * highest payable Accelerate/Crystallize → else normal (will fail PP check).
 *
 * When multiple Enhance tiers are affordable, all tiers with cost ≤ paid PP
 * activate (ascending cost order after Fanfare). Play cost is the highest
 * affordable tier's cost.
 *
 * Crest passive `suppress_fanfare_enhance` skips Enhance so the ability
 * does not activate (play at normal cost instead).
 */
export function resolvePlayCost(
  card: CardInstance,
  availablePP: number,
): PlayCostPlan {
  const effectivePlayCost = getEffectivePlayCost(card);
  const owner =
    card.owner === "first" || card.owner === "second"
      ? card.owner
      : state.activePlayer;
  const suppressEnhance =
    !!owner && playerHasCrestPassive(owner, "suppress_fanfare_enhance");
  const enhanceTiers = suppressEnhance
    ? []
    : pickEnhanceTiers(card, availablePP);
  if (enhanceTiers.length) {
    const highest = enhanceTiers[enhanceTiers.length - 1]!;
    return {
      mode: "enhance",
      cost: highest.cost,
      enhanceTiers,
      alternate: null,
      effectivePlayCost,
    };
  }
  if (availablePP >= effectivePlayCost) {
    return {
      mode: "normal",
      cost: effectivePlayCost,
      enhanceTiers: [],
      alternate: null,
      effectivePlayCost,
    };
  }
  const alternate = pickAlternateForm(card, availablePP, effectivePlayCost);
  if (alternate) {
    return {
      mode: alternate.kind,
      cost: alternate.cost,
      enhanceTiers: [],
      alternate,
      effectivePlayCost,
    };
  }
  return {
    mode: "normal",
    cost: effectivePlayCost,
    enhanceTiers: [],
    alternate: null,
    effectivePlayCost,
  };
}
