// src/logic/effects/ops/reanimate.ts
import { state } from "@core/gameState.js";
import { reanimateSummon } from "@logic/effects/ops/summon.js";
import { randInt } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
export function handleReanimate(eff, owner) {
    const maxCost = parseInt(eff.max_cost) || 0;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;
    // Find all followers in graveyard with cost <= maxCost
    const eligible = grave.filter(card => card.type === "Follower" &&
        (parseInt(card.cost) || 0) <= maxCost);
    if (eligible.length === 0) {
        console.log("No eligible followers to reanimate");
        return;
    }
    // Group by cost for prioritization
    const byCost = {};
    eligible.forEach(card => {
        const cost = parseInt(card.cost) || 0;
        byCost[cost] = byCost[cost] || [];
        byCost[cost].push(card);
    });
    // Try to find highest cost available (up to maxCost)
    let candidates = [];
    for (let cost = maxCost; cost >= 0; cost--) {
        if (byCost[cost]?.length > 0) {
            candidates = byCost[cost];
            break;
        }
    }
    if (candidates.length === 0) {
        console.log("No candidates found despite eligibility check");
        return;
    }
    // Randomly select one from the highest available cost group
    const selected = candidates[randInt(candidates.length)];
    logEvent("reanimatePick", { owner, name: selected.name, cost: parseInt(selected.cost) || 0 });
    // The key changes are here:
    // 1. Do NOT remove the card from the graveyard.
    // 2. Do NOT decrement the shadows.
    // Call the new helper function to summon a copy of the selected card
    reanimateSummon(selected, owner);
    logEvent("reanimateSummon", { owner, name: selected.name });
}
