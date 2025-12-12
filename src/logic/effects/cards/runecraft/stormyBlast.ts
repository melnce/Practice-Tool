// src/logic/effects/cards/runecraft/stormyBlast.ts
import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { Player, CardInstance, Effect } from "../../../../core/types.js";

// move into state instead of a module global
function ensureCounterState() {
    // @ts-ignore
    if (!state.stormyBlastCounters) state.stormyBlastCounters = {};
    // @ts-ignore
    return state.stormyBlastCounters;
}

export function handleStormyBlastCounter(card: CardInstance) {
    if (!card) return;
    const counters = ensureCounterState();
    const cur = counters[card.uid] ?? 2; // base X = 2
    counters[card.uid] = cur + 1;        // +1 per Spellboost
    // @ts-ignore
    card.currentStormyBlastDamage = counters[card.uid];
}

export function handleStormyBlastDamage(eff: Effect, owner: Player, sourceCard: CardInstance, effectsQueue: Effect[]) {
    const counters = ensureCounterState();
    let damageAmount = 2;

    if (sourceCard?.uid && counters[sourceCard.uid]) {
        damageAmount = counters[sourceCard.uid];
        delete counters[sourceCard.uid]; // cleanup after cast
    }

    state.pendingTargetEffect = {
        // @ts-ignore
        eff: { op: "damage", amount: damageAmount, target: "enemy:follower" },
        owner,
        sourceCard: sourceCard || null,
        targets: [],
        selectCount: 1,
        pool: getPool("enemy:follower", owner, sourceCard || null, {}, { isTargetedEffect: true }),
        resumeEffects: effectsQueue
    };

    highlightSelectable(state.pendingTargetEffect.pool);
    return "pending";
}
