// src/logic/effects/crest.ts
import { state } from "../../core/gameState.js";
import { adapter } from "../../core/adapter.js";
import { runEffects } from "../core/effects/index.js";
import { logEvent } from "../../core/logger.js";
import { Effect, Player } from "../../core/types.js";

// TODO: Define Crest type properly or reuse CardInstance with custom fields?
// For now, using any to unblock migration.
type Crest = any;

function getCrests(owner: Player) {
    return owner === "blue" ? state.blueCrests : state.redCrests;
}
function findCrest(owner: Player, name: string) {
    const list = getCrests(owner) || [];
    return list.find(
        (c) => String(c.name).toLowerCase() === String(name).toLowerCase()
    );
}

/** Normalize to array */
function toArray(x: any) {
    return Array.isArray(x) ? x : x ? [x] : [];
}

export function handleGainCrest(eff: Effect, owner: Player) {


    // NEW: allow giving to opponent
    const targetOwner =
        (eff as any).player === "opponent" ? (owner === "blue" ? "red" : "blue") : owner;

    const crests = targetOwner === "blue" ? state.blueCrests : state.redCrests;
    const crestName = (eff as any).name?.trim();
    if (!crestName || crests.some((c) => c.name === crestName)) {
        console.warn(`[Crest] Crest "${crestName}" already active or invalid.`);
        return;
    }

    // Support both legacy "trigger" (single) and new "triggers" (array)
    const triggers = (eff as any).triggers?.length ? (eff as any).triggers : toArray((eff as any).trigger);

    const newCrest: Crest = {
        name: crestName,
        image: (eff as any).image,
        description: (eff as any).description,
        counters: {}, // <-- store arbitrary named counters
        countdown: Number.isFinite(+(eff as any).countdown) ? +(eff as any).countdown : undefined,
        // countdown-based “expiry effects” (legacy path)
        effects: Array.isArray(eff.effects) ? eff.effects : [],
        // multi-event triggers
        triggers: (triggers || []).map((t: any) => ({
            event: t.event,
            effects: Array.isArray(t.effects) ? t.effects : [],
            once_per_turn: !!t.once_per_turn,
            usedThisTurn: false,
            condition: t.condition || null, // Store condition for filtering
        })),
        owner: targetOwner,
    };

    crests.push(newCrest);
    logEvent("gainCrest", { owner: targetOwner, crest: crestName });
    console.log(`[Crest] ${targetOwner} gained Crest: "${crestName}"`);
}

export function crestAddCounter(owner: Player, crestName: string, counterName: string, amount = 1) {
    const crest = findCrest(owner, crestName);
    if (!crest) return false;
    crest.counters = crest.counters || {};
    const oldVal = crest.counters[counterName] || 0;
    crest.counters[counterName] = oldVal + (parseInt(amount as any, 10) || 0);
    return true;
}

export function crestSpendCounter(owner: Player, crestName: string, counterName: string, amount = 1) {
    const crest = findCrest(owner, crestName);
    if (!crest) return false;
    const need = parseInt(amount as any, 10) || 0;
    const cur = parseInt(crest.counters?.[counterName] || 0, 10);
    if (cur < need) return false;
    crest.counters[counterName] = cur - need;
    return true;
}

/** Start-of-turn countdown tick (unchanged behavior) */
export function tickCrests(owner: Player) {
    const crests = owner === "blue" ? state.blueCrests : state.redCrests;
    if (!Array.isArray(crests) || !crests.length) return [];

    // 1) Countdown left→right (visual order) and collect expirations
    const expiredIdx: number[] = [];
    const effectsToRun: Effect[] = [];

    for (let i = 0; i < crests.length; i++) {
        const c = crests[i];
        if (!Number.isFinite(c?.countdown)) continue;

        c.countdown -= 1;

        if (c.countdown <= 0) {
            logEvent("crestExpire", { owner, crest: c.name });
            // preserve *forward* order of expiring crests
            if (Array.isArray(c.effects) && c.effects.length) {
                effectsToRun.push(...c.effects);
            }
            expiredIdx.push(i);
        }
    }

    // 2) Remove expired crests without disturbing earlier indices
    if (expiredIdx.length) {
        for (let k = expiredIdx.length - 1; k >= 0; k--) {
            const idx = expiredIdx[k];
            if (idx !== undefined) crests.splice(idx, 1);
        }
    }

    return effectsToRun;
}

/** NEW: reset once-per-turn gates at owner’s turn start */
export function resetCrestOncePerTurn(owner: Player) {
    const crests = owner === "blue" ? state.blueCrests : state.redCrests;
    if (!crests) return;
    for (const c of crests) {
        if (Array.isArray(c.triggers)) {
            for (const t of c.triggers) t.usedThisTurn = false;
        }
    }
}

/**
 * NEW: collect effects for a crest event.
 * Returns a flat list of effects to be executed by runEffects(owner).
 */
export function processCrestEvent(owner: Player, event: string) {
    const crests = owner === "blue" ? state.blueCrests : state.redCrests;
    if (!crests) return [];
    const out: Effect[] = [];

    (state as any).__DEBUG_CREST_LOOP_STARTED = true;
    (state as any).__DEBUG_CREST_COUNT = crests.length;

    for (const crest of crests) {
        if (!Array.isArray(crest.triggers)) {
            (state as any).__DEBUG_CREST_SKIPPED = true;
            console.log("[Crest] Skipping crest (no triggers):", crest.name);
            continue;
        }
        for (const t of crest.triggers) {
            (state as any).__DEBUG_TRIGGER_CHECKED = true;
            console.log("[Crest] Checking trigger:", t.event, "vs", event);
            if (t.event !== event) continue;
            (state as any).__DEBUG_TRIGGER_MATCHED = true;
            if (t.once_per_turn && t.usedThisTurn) continue;
            if (t.effects?.length) out.push(...t.effects);
            if (t.once_per_turn) t.usedThisTurn = true;
        }
    }
    if (out.length) console.log(`[Crest] processCrestEvent("${event}") found ${out.length} effects.`);
    return out;
}

// Call this when a crest reaches 0 to pay out immediately and remove it.
export function completeCrest(crest: Crest, owner: Player, context: any = {}) {
    if (!crest) return;
    const list = owner === "blue" ? state.blueCrests : state.redCrests;
    if (!Array.isArray(list) || !list.includes(crest)) return; // already gone

    logEvent("crestComplete", { owner, crest: crest.name });

    // Pay out the crest's reward/effects
    if (Array.isArray(crest.effects) && crest.effects.length) {
        runEffects([...crest.effects], owner, crest, context);
    }

    // Remove the crest so start-of-turn doesn’t fire it again
    const idx = list.indexOf(crest);
    if (idx !== -1) list.splice(idx, 1);
    adapter.render();
}

/**
 * Remove a specific crest by name from the owner.
 */
export function removeCrest(owner: Player, crestName: string) {
    const list = owner === "blue" ? state.blueCrests : state.redCrests;
    if (!Array.isArray(list)) return;

    const idx = list.findIndex(c => c.name === crestName);
    if (idx !== -1) {
        list.splice(idx, 1);
        console.log(`[Crest] Removed crest "${crestName}" from ${owner}`);
        adapter.render();
    }
}

/**
 * Advance (reduce) the countdown of a specific crest.
 */
export function crestAdvanceCountdown(owner: Player, crestName: string, amount: number = 1) {
    const crest = findCrest(owner, crestName);
    if (!crest || !Number.isFinite(crest.countdown)) return;

    crest.countdown -= amount;
    console.log(`[Crest] Advanced countdown of "${crestName}" by ${amount}. New countdown: ${crest.countdown}`);

    if (crest.countdown <= 0) {
        completeCrest(crest, owner);
    } else {
        adapter.render();
    }
}
