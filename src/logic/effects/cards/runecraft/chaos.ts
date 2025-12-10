// src/logic/effects/cards/runecraft/chaos.ts
import { state } from "@core/gameState.js";
import { handleDamageSplitFixed } from "@logic/effects/ops/damage.js";
import { render } from "@ui/render.js";
import { logEvent } from "@core/logger.js";
import { CardInstance, Player } from "@core/types.js";

// Persist counters in state so undo/redo keeps them
function ensureChaosState() {
    // @ts-ignore
    if (!state.chaosCounters) state.chaosCounters = {};
    // @ts-ignore
    return state.chaosCounters;
}

export function handleChaosCounter(card: CardInstance) {
    if (!card) return;
    const counters = ensureChaosState();
    const cur = counters[card.uid] ?? 0;     // base X = 0
    counters[card.uid] = cur + 1;            // +1 per Spellboost
    // @ts-ignore
    card.currentChaosDamage = counters[card.uid]; // UI helper for preview
}

export function handleChaosSplitDamage(owner: Player, sourceCard: CardInstance) {
    const counters = ensureChaosState();
    let x = 0;

    if (sourceCard?.uid && counters[sourceCard.uid]) {
        x = counters[sourceCard.uid];
    }
    if (x <= 0) return;

    // deterministic split between all enemy followers
    handleDamageSplitFixed(
        // @ts-ignore
        { op: "damage_split_fixed", target: "enemy:follower", amount: x },
        owner
    );

    logEvent("chaosSplitDamage", { owner, source: sourceCard?.name, amount: x });

    // cleanup after cast (snapshot-safe)
    delete counters[sourceCard.uid];
    // @ts-ignore
    sourceCard.currentChaosDamage = 0;

    // ensure UI updates immediately
    render();
}
