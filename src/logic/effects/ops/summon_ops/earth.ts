import { CardInstance, CardTemplate } from "../../../../core/types.js";
import { isAmulet, normalizeName } from "./utils.js";

// =============== Utilities ===============

export function isWitchsNewBrew(card: CardInstance) {
    const n = normalizeName(card?.name);
    return isAmulet(card) && n.includes("witch") && n.includes("brew");
}

export function isMagicSediment(card: CardInstance) {
    return isAmulet(card) && normalizeName(card?.name) === "magic sediment";
}

export function isEarthSigil(card: CardInstance) {
    // In this engine, Earth Sigils on board are represented by either Brew or Sediment.
    return isWitchsNewBrew(card) || isMagicSediment(card);
}


// Return how many earth counters a card *starts* with, based on its keywords
export function startingEarthFromKeywords(cardData: CardTemplate) {
    let n = 0;
    const kws = Array.isArray(cardData?.keywords) ? cardData.keywords : [];
    for (const k of kws) {
        // @ts-ignore
        if (typeof k !== "string" && k?.name === "Counter" && String(k.key) === "earth") {
            n += Number(k.count || 0);
        }
    }
    // Safety default: most Earth Sigil amulets start with 1
    return n || 1;
}

// =============== Earth Sigil Merge + De-dup ===============

// Find an existing Earth Sigil on board for the owner: prefer Brew (replacement rule), else Sediment.
export function findEarthSigilTarget(board: CardInstance[]) {
    let brew = null;
    let sediment = null;
    for (const c of board) {
        if (!isAmulet(c)) continue;
        if (isWitchsNewBrew(c)) {
            brew = brew || c;
        } else if (isMagicSediment(c)) {
            sediment = sediment || c;
        }
    }
    return brew || sediment || null;
}

// Add "amount" earth counters to the preferred Earth Sigil target, if present.
// Returns true if merged into an existing amulet (no new card should be created).
export function tryMergeIntoExistingEarthSigil(board: CardInstance[]) {
    const target = findEarthSigilTarget(board);
    if (!target) return false;

    target.counters = target.counters || {};
    target.counters.earth = (target.counters.earth || 0) + 1;
    return true;
}

// Helper function to merge sigils of the same type
export function mergeSigils(board: CardInstance[], sigilsToMerge: CardInstance[]) {
    if (sigilsToMerge.length <= 1) return;

    // Choose the first one as survivor
    const survivor = sigilsToMerge[0];
    if (!survivor) return;

    // Sum counters from the others
    let totalEarth = Number(survivor.counters?.earth || 0);
    for (let i = 1; i < sigilsToMerge.length; i++) {
        const s = sigilsToMerge[i];
        if (!s) continue;
        totalEarth += Number(s.counters?.earth || 0);

        // Remove from board
        const idx = board.indexOf(s);
        if (idx !== -1) board.splice(idx, 1);
    }

    // Update survivor counters
    survivor.counters = survivor.counters || {};
    survivor.counters.earth = totalEarth;
}

// After any summon that could touch Earth Sigils, merge duplicates down to one.
// Preferred survivor: Brew if present, else the oldest Sediment (first found).
// All earth counters from the others are absorbed into the survivor; extras are removed.
export function dedupeEarthSigils(board: CardInstance[]) {
    const sigils = board.filter(isEarthSigil);
    if (sigils.length <= 1) return;

    // Group by type: Brews and Sediments
    const brews = sigils.filter(isWitchsNewBrew);
    const sediments = sigils.filter(isMagicSediment);

    // If we have multiple Brews, merge them into one
    if (brews.length > 1) {
        mergeSigils(board, brews);
    }

    // If we have multiple Sediments, merge them into one
    if (sediments.length > 1) {
        mergeSigils(board, sediments);
    }
}
