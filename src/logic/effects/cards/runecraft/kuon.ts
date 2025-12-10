// src/logic/effects/cards/runecraft/kuon.ts
import { state } from "@core/gameState.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { summonNamed } from "@logic/effects/ops/summon.js";
import { render } from "@ui/render.js";
import { logEvent } from "@core/logger.js";
import { Player, CardInstance } from "@core/types.js";


function boardOf(owner: Player) {
    return owner === "blue" ? state.blueBoard : state.redBoard;
}
function isShikigamiFollower(c: CardInstance) {
    // @ts-ignore
    return c?.type === "Follower" && Array.isArray(c.tribes) && c.tribes.includes("Shikigami");
}

export function handleKuonEnhance(owner: Player) {
    const board = boardOf(owner);

    // 1) Destroy all allied Shikigami (cleanupDead will log base stats)
    const toKill = [];
    for (const c of board) {
        if (isShikigamiFollower(c)) {
            c.defense = 0;
            toKill.push(c);
        }
    }
    if (toKill.length) cleanupDead();

    // 2) Sum ALL Shikigami that died THIS TURN (BASE stats only)
    const pool = owner === "blue"
        // @ts-ignore
        ? (state.shikigamiDeathsThisTurnBlue || [])
        // @ts-ignore
        : (state.shikigamiDeathsThisTurnRed || []);
    const sumA = pool.reduce((acc: number, x: CardInstance) => acc + (x.attack || 0), 0);
    const sumD = pool.reduce((acc: number, x: CardInstance) => acc + (x.defense || 0), 0);

    // 3) Summon Noble Shikigami
    // @ts-ignore
    summonNamed({ op: "summon_named", name: "Noble Shikigami", count: 1 }, owner);

    // 4) Buff Noble with the tallied totals
    const noble = (state.lastSummoned && state.lastSummoned[0]) || null;
    if (noble && noble.type === "Follower" && noble.name === "Noble Shikigami") {
        if (!noble.buffs) noble.buffs = { attack: 0, defense: 0 };
        noble.buffs.attack += sumA;
        noble.buffs.defense += sumD;
        // @ts-ignore
        noble.attack = (parseInt(noble.attack) || 0) + sumA;
        // @ts-ignore
        noble.defense = (parseInt(noble.defense) || 0) + sumD;
        // @ts-ignore
        noble.peak_defense = Math.max(noble.peak_defense ?? noble.defense, noble.defense);

        // Log the kuon enhance effect
        logEvent("kuonEnhance", { owner, sumA, sumD, nobleUid: noble.uid });
    }

    render();
}
