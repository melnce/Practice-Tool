import type { CardInstance, Effect } from "../../../core/types/index.js";
import {
  getEffectivePlayCost,
  pickAlternateForm,
  type AlternateForm,
} from "../../../helpers/alternateForm.js";
import { playerHasCrestPassive } from "../../effects/crest.js";
import { state } from "../../../core/gameState.js";

export function getEffectiveCost(card: CardInstance): number {
  if (typeof card.effectiveCost === "number") return card.effectiveCost;
  if (card.cost_mod != null)
    return (
      (parseInt(String(card.cost), 10) || 0) +
      (parseInt(String(card.cost_mod), 10) || 0)
    );
  if ((card as any).costModified != null)
    return parseInt((card as any).costModified, 10) || 0;
  return parseInt(String(card.cost), 10) || 0;
}

export function pickEnhanceTier(
  card: CardInstance,
  availablePP: number,
): { cost: number; effects: Effect[] } | null {
  const tiers = Array.isArray(card.enhanceTiers) ? card.enhanceTiers : [];
  if (!tiers.length && Array.isArray(card.keywords)) {
    const tmp = [];
    for (const k of card.keywords) {
      const name = (typeof k === "string" ? k : k?.name) || "";
      if (name.toLowerCase() === "enhance") {
        const cost = Number(typeof k === "object" ? k.cost : 0);
        const effects =
          typeof k === "object" && Array.isArray(k.effects) ? k.effects : [];
        if (cost > 0) tmp.push({ cost, effects });
      }
    }
    tmp.sort((a: any, b: any) => b.cost - a.cost);
    (card as any).enhanceTiers = tmp;
  }
  for (const t of card.enhanceTiers || []) {
    if (availablePP >= t.cost)
      return { cost: t.cost, effects: t.effects || [] }; // highest affordable
  }
  return null;
}

export type PlayCostMode = "enhance" | "normal" | "accelerate" | "crystallize";

export interface PlayCostPlan {
  mode: PlayCostMode;
  /** PP to spend for this play. */
  cost: number;
  enhanceTier: { cost: number; effects: Effect[] } | null;
  alternate: AlternateForm | null;
  /** Effective printed-form cost (base + hand mod). */
  effectivePlayCost: number;
}

/**
 * Resolve which form/cost a play will use.
 * Priority: Enhance (if affordable) → normal (if affordable) →
 * highest payable Accelerate/Crystallize → else normal (will fail PP check).
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
  const enhanceTier = suppressEnhance
    ? null
    : pickEnhanceTier(card, availablePP);
  if (enhanceTier) {
    return {
      mode: "enhance",
      cost: enhanceTier.cost,
      enhanceTier,
      alternate: null,
      effectivePlayCost,
    };
  }
  if (availablePP >= effectivePlayCost) {
    return {
      mode: "normal",
      cost: effectivePlayCost,
      enhanceTier: null,
      alternate: null,
      effectivePlayCost,
    };
  }
  const alternate = pickAlternateForm(card, availablePP, effectivePlayCost);
  if (alternate) {
    return {
      mode: alternate.kind,
      cost: alternate.cost,
      enhanceTier: null,
      alternate,
      effectivePlayCost,
    };
  }
  return {
    mode: "normal",
    cost: effectivePlayCost,
    enhanceTier: null,
    alternate: null,
    effectivePlayCost,
  };
}
