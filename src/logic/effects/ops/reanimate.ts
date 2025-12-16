// src/logic/effects/ops/reanimate.ts
import { state } from "../../../core/gameState.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { reanimateSummon } from "./summon.js";
import { rand, randInt } from "../../../core/rng.js";
import { logEvent } from "../../../core/logger.js";
import { Effect, Player, CardInstance } from "../../../core/types.js";



export function handleReanimate(eff: Effect, owner: Player) {
    const maxCost = parseInt((eff as any).max_cost) || 0;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;

    // Find all followers in graveyard with cost <= maxCost
    const eligible = grave.filter(card =>
        card.type === "Follower" &&
        (parseInt((card as any).cost) || 0) <= maxCost
    );

    if (eligible.length === 0) {
        console.log("No eligible followers to reanimate");
        return;
    }

    // Group by cost for prioritization
    const byCost: Record<number, CardInstance[]> = {};
    eligible.forEach(card => {
        const cost = parseInt((card as any).cost) || 0;
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
        console.log("No candidates found despite eligibility check");
        return;
    }

    // Randomly select one from the highest available cost group
    const selected = candidates[randInt(candidates.length)];
    if (!selected) return;
    logEvent("reanimatePick", { owner, name: selected.name, cost: parseInt(selected.cost as any) || 0 });

    // The key changes are here:
    // 1. Do NOT remove the card from the graveyard.
    // 2. Do NOT decrement the shadows.

    // Call the new helper function to summon a copy of the selected card
    reanimateSummon(selected, owner);
    logEvent("reanimateSummon", { owner, name: selected.name });
}
