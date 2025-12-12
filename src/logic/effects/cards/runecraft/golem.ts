// src/logic/effects/cards/runecraft/golem.ts
import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { Player, CardInstance, Effect } from "../../../../core/types.js";


export function handleSelectEvolveGolem(eff: any, owner: Player, sourceCard: CardInstance, effectsQueue: Effect[]) {
    const pool = getPool("ally:follower", owner).filter(c =>
        (Array.isArray(c.tribes) && c.tribes.some(t => String(t).toLowerCase() === "golem")) ||
        /golem/i.test(String(c.name || ""))
    );

    if (!pool.length) return "done";

    highlightSelectable(pool);
    state.pendingTargetEffect = {
        // @ts-ignore
        eff: { op: "evolve_and_buff", attack: eff.attack ?? 3, defense: eff.defense ?? 3 },
        owner,
        sourceCard,
        resumeEffects: effectsQueue,
        pool, // <-- Add this
        targets: [], // <-- Add this
        selectCount: 1, // <-- Add this (it's always 1 for this effect)
    };
    return "pending";
}
