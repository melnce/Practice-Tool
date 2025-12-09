import { state } from "@core/gameState.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { summonNamed } from "@logic/effects/ops/summon.js";
import { render } from "@ui/render.js";
import { logEvent } from "@core/logger.js"; // Add import
function boardOf(owner) {
    return owner === "blue" ? state.blueBoard : state.redBoard;
}
function isShikigamiFollower(c) {
    return c?.type === "Follower" && Array.isArray(c.tribes) && c.tribes.includes("Shikigami");
}
export function handleKuonEnhance(owner) {
    const board = boardOf(owner);
    // 1) Destroy all allied Shikigami (cleanupDead will log base stats)
    const toKill = [];
    for (const c of board) {
        if (isShikigamiFollower(c)) {
            c.defense = 0;
            toKill.push(c);
        }
    }
    if (toKill.length)
        cleanupDead();
    // 2) Sum ALL Shikigami that died THIS TURN (BASE stats only)
    const pool = owner === "blue"
        ? (state.shikigamiDeathsThisTurnBlue || [])
        : (state.shikigamiDeathsThisTurnRed || []);
    const sumA = pool.reduce((acc, x) => acc + (x.attack || 0), 0);
    const sumD = pool.reduce((acc, x) => acc + (x.defense || 0), 0);
    // 3) Summon Noble Shikigami
    summonNamed({ op: "summon_named", name: "Noble Shikigami", count: 1 }, owner);
    // 4) Buff Noble with the tallied totals
    const noble = (state.lastSummoned && state.lastSummoned[0]) || null;
    if (noble && noble.type === "Follower" && noble.name === "Noble Shikigami") {
        if (!noble.buffs)
            noble.buffs = { attack: 0, defense: 0 };
        noble.buffs.attack += sumA;
        noble.buffs.defense += sumD;
        noble.attack = (parseInt(noble.attack) || 0) + sumA;
        noble.defense = (parseInt(noble.defense) || 0) + sumD;
        noble.peak_defense = Math.max(noble.peak_defense ?? noble.defense, noble.defense);
        // Log the kuon enhance effect
        logEvent("kuonEnhance", { owner, sumA, sumD, nobleUid: noble.uid });
    }
    render();
}
