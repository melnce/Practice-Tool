// src/logic/effects/doubleStats.ts
import { state } from "../../core/gameState.js";
// @ts-ignore
// @ts-ignore
import { adapter } from "../../core/adapter.js";
import { cleanupDead } from "../core/cleanup.js";
import { logEvent } from "../../core/logger.js";
import { Player } from "../../core/types.js";

export function doubleStatsAllies(owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    logEvent("doubleStatsAllies", { owner, count: board.length });
    for (const c of board) {
        if (!c || c.type !== "Follower") continue;

        const a = parseInt(c.attack as any) || 0;
        const d = parseInt(c.defense as any) || 0;

        // +current attack/defense == doubling
        // @ts-ignore
        c.attack = a + a;
        // @ts-ignore
        c.defense = d + d;

        // peak tracking like in buff.js
        c.peak_defense = Math.max(c.peak_defense ?? (c.defense as number), c.defense as number);
        if (!c.potential_attack) c.potential_attack = (c as any).base_attack || c.attack;
        if (!c.potential_defense) c.potential_defense = (c as any).base_defense || c.defense;
        c.potential_attack = c.attack as any;
        c.potential_defense = c.defense as any;
    }
    cleanupDead();
    adapter.render();
}
