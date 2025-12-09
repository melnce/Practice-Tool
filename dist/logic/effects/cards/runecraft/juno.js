import { state } from "@core/gameState.js";
import { getPool, highlightSelectable } from "@logic/core/targeting.js";
import { dealDamage } from "@logic/core/barrier.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { hasEarthSigils } from "@logic/effects/cards/runecraft/earth.js";
export function handleJunoDamage(eff, owner, sourceCard, effectsQueue) {
    const pool = getPool("enemy:follower", owner, sourceCard, {}, { isTargetedEffect: true });
    if (!pool.length)
        return "done";
    const earthCount = (owner === "blue" ? state.blueBoard : state.redBoard)
        .filter(c => c?.type === "Amulet" && (c.counters?.earth || 0) > 0)
        .reduce((sum, c) => sum + (c.counters?.earth || 0), 0);
    if (earthCount <= 0)
        return "done";
    state.pendingTargetEffect = {
        eff: { ...eff, op: "juno_damage", amount: earthCount },
        owner,
        sourceCard,
        targets: [],
        selectCount: 1,
        pool,
        resumeEffects: effectsQueue
    };
    highlightSelectable(pool);
    return "pending";
}
