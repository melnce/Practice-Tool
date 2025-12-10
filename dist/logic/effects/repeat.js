// src/logic/effects/repeat.ts
import { state } from "@core/gameState.js";
import { logEvent } from "@core/logger.js";
export function handleRepeatEffect(eff, owner, sourceCard, effectsQueue) {
    if (!eff.effect || !effectsQueue)
        return;
    let count = 0;
    switch (eff.count_source) {
        case "count_in_hand":
            if (eff.filter?.tribe) {
                const hand = owner === "blue" ? state.blueHand : state.redHand;
                count = hand.filter((c) => Array.isArray(c.tribes) && c.tribes.includes(eff.filter.tribe)).length;
            }
            break;
        // NEW: number of crests you have
        case "crest_count":
            count =
                ((owner === "blue" ? state.blueCrests : state.redCrests) || []).length |
                    0;
            break;
        default:
            return;
    }
    if (count > 0) {
        logEvent("repeatExpand", { owner, count, source: sourceCard?.name });
    }
    for (let i = 0; i < count; i++) {
        effectsQueue.push(JSON.parse(JSON.stringify(eff.effect)));
    }
}
