// src/logic/effects/cards/runecraft/william.ts
import { state } from "@core/gameState.js";
import { dealDamage } from "@logic/core/barrier.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { logEvent } from "@core/logger.js";
import { Player, CardInstance } from "@core/types.js";


const williamCounters: Record<number, number> = {}; // per-card X while in hand/board

export function handleWilliamCounter(card: CardInstance) {
    if (!card) return;
    const cur = williamCounters[card.uid] ?? 0;     // X starts at 0
    williamCounters[card.uid] = cur + 1;           // +1 per Spellboost
    // @ts-ignore
    card.currentWilliamDamage = williamCounters[card.uid];
}

export function handleWilliamDamageAll(owner: Player, sourceCard: CardInstance) {
    // Use current stored X; default to 0
    // @ts-ignore
    const x = sourceCard?.currentWilliamDamage ?? 0;
    if (x <= 0) { cleanupDead(); return; }

    const enemy = owner === "blue" ? "red" : "blue";
    const pool = (enemy === "blue" ? state.blueBoard : state.redBoard)
        .filter(c => c.type === "Follower");

    // Log the william damage effect
    logEvent("williamDamageAll", { owner, source: sourceCard.name, amount: x, hits: pool.map(c => c.name) });

    for (const t of pool) dealDamage(t, x);
    cleanupDead();

    //reset after use
    williamCounters[sourceCard.uid] = 0;
    // @ts-ignore
    sourceCard.currentWilliamDamage = 0;
}
