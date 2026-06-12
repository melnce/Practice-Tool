// src/logic/effects/ops/reanimate.ts
import { state } from "../../../core/gameState.js";
import { reanimateSummon } from "./summon.js";
import { handleEvolveLastSummoned } from "./evolve.js";

import { logEvent } from "../../../core/logger.js";
import type { Effect, Player, CardInstance } from "../../../core/types/index.js";
import { getGraveyard } from "../../../core/playerHelpers.js";

// Local type to avoid 'any'
type ReanimateEffect = Effect & {
  max_cost?: number | string;
  cost?: number | string;
  x?: number | string;
  evolve_summons?: boolean;
};

export function handleReanimate(eff: Effect, owner: Player) {
  const rEff = eff as ReanimateEffect;
  // Resolve prioritization: max_cost > cost > x > 0
  const rawCost = rEff.max_cost ?? rEff.cost ?? rEff.x ?? 0;
  const maxCost = parseInt(String(rawCost)) || 0;
  console.log("[REANIMATE DEBUG]", { owner, maxCost, rawCost, eff: rEff });

  // Determine graveyard
  const grave = getGraveyard(state, owner);
  console.log("[REANIMATE DEBUG] Graveyard:", grave.length, "cards", grave.map(c => c.name + " (" + c.cost + ")"));

  // Find all followers in graveyard with cost <= maxCost
  const eligible = grave.filter((card) => {
    if (card.type !== "Follower") return false;
    // cost on CardInstance might be number or string?
    // Using explicit cast or check
    const cCost = parseInt(String(card.cost ?? 0)) || 0;
    return cCost <= maxCost;
  });

  if (eligible.length === 0) {
    logEvent("reanimateNoTargets", { maxCost, graveSize: grave.length });
    return;
  }

  // Group by cost for prioritization
  const byCost: Record<number, CardInstance[]> = {};
  eligible.forEach((card) => {
    const cost = parseInt(String(card.cost ?? 0)) || 0;
    byCost[cost] = byCost[cost] || [];
    byCost[cost].push(card);
  });

  // Try to find highest cost available (up to maxCost)
  let candidates: CardInstance[] = [];
  for (let cost = maxCost; cost >= 0; cost--) {
    const costCandidates = byCost[cost];
    if (costCandidates && costCandidates.length > 0) {
      candidates = costCandidates;
      break;
    }
  }

  if (candidates.length === 0) {
    logEvent("reanimateNoCandidates", { maxCost });
    return;
  }

  // Randomly select one from the highest available cost group
  const selected = candidates[state.rng.nextInt(candidates.length)];
  if (!selected) return;
  logEvent("reanimatePick", {
    owner,
    name: selected.name,
    cost: parseInt(String(selected.cost ?? 0)) || 0,
  });

  // The key changes are here:
  // 1. Do NOT remove the card from the graveyard.
  // 2. Do NOT decrement the shadows.

  // Call the new helper function to summon a copy of the selected card
  reanimateSummon(selected, owner);
  logEvent("reanimateSummon", { owner, name: selected.name });

  if (rEff.evolve_summons) {
    handleEvolveLastSummoned(owner);
  }
}















