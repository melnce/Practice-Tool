// src/logic/effects/crest.ts
import { state } from "../../core/gameState.js";
import { runEffects } from "../core/effects/index.js";
import { logEvent } from "../../core/logger.js";
import { Effect, Player } from "../../core/types/index.js";
import { isFirstPlayer, opponentOf, getCrests as getCrestsHelper } from "../../core/playerHelpers.js";

// =============================================================================
// CREST TYPES
// =============================================================================

/**
 * Event trigger attached to a crest (e.g., "end_of_turn_own")
 */
export interface CrestTrigger {
  event?: string;
  type?: string; // Alias for event in some triggers
  effects?: Effect[];
  once_per_turn?: boolean;
  usedThisTurn?: boolean;
  condition?: Record<string, unknown> | null;
}

/**
 * Crest - represents an active effect/aura on a player.
 * 
 * Crests can have:
 * - countdown: Decrements at start of turn, fires effects when reaching 0
 * - triggers: Event-based effects (e.g., end_of_turn_own)
 * - keywords: Including "Last Words" which fires effects on destroy
 * - effects: The payload effects (fired on countdown=0 OR destroy if Last Words)
 */
export interface Crest {
  name: string;
  owner: Player;

  // Visual/description
  image?: string;
  description?: string;

  // Counters (e.g., "faith" counter for some crests)
  counters?: Record<string, number>;

  // Countdown (decrements at start of turn)
  countdown?: number;

  // Effects to run when countdown=0 OR when destroyed (if has Last Words keyword)
  effects?: Effect[];

  // Event triggers (e.g., end_of_turn_own)
  triggers?: CrestTrigger[];

  // Legacy: single trigger (backwards compatibility)
  trigger?: CrestTrigger;

  // Keywords (e.g., ["Last Words"])
  keywords?: string[];
}

function getCrests(owner: Player) {
  return getCrestsHelper(state, owner);
}
function findCrest(owner: Player, name: string) {
  const list = getCrests(owner) || [];
  return list.find(
    (c) => String(c.name).toLowerCase() === String(name).toLowerCase(),
  );
}

/** Normalize to array */
function toArray(x: any) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

export function handleGainCrest(eff: Effect, owner: Player) {
  // NEW: allow giving to opponent
  const targetOwner = (eff as any).player === "opponent" ? opponentOf(owner) : owner;

  const crests = getCrestsHelper(state, targetOwner);
  const crestName = (eff as any).name?.trim();
  if (!crestName || crests.some((c) => c.name === crestName)) {
    console.warn(`[Crest] Crest "${crestName}" already active or invalid.`);
    return;
  }

  // Support both legacy "trigger" (single) and new "triggers" (array)
  const triggers = (eff as any).triggers?.length
    ? (eff as any).triggers
    : toArray((eff as any).trigger);

  const newCrest = {
    name: crestName,
    image: (eff as any).image,
    description: (eff as any).description,
    counters: {}, // <-- store arbitrary named counters
    countdown: Number.isFinite(+(eff as any).countdown)
      ? +(eff as any).countdown
      : undefined,
    // countdown-based “expiry effects” (legacy path)
    effects: Array.isArray(eff.effects) ? eff.effects : [],
    // multi-event triggers
    triggers: (triggers || []).map((t: any): CrestTrigger => ({
      event: t.event,
      type: t.type, // Include type field (e.g., "end_of_turn_own")
      effects: Array.isArray(t.effects) ? t.effects : [],
      once_per_turn: !!t.once_per_turn,
      usedThisTurn: false,
      condition: t.condition ?? null,
    })),
    owner: targetOwner,
  } as Crest;

  crests.push(newCrest);
  logEvent("gainCrest", { owner: targetOwner, crest: crestName });
}

export function crestAddCounter(
  owner: Player,
  crestName: string,
  counterName: string,
  amount = 1,
) {
  const crest = findCrest(owner, crestName);
  if (!crest) return false;
  crest.counters = crest.counters || {};
  const oldVal = crest.counters[counterName] || 0;
  crest.counters[counterName] = oldVal + (parseInt(amount as any, 10) || 0);
  return true;
}

export function crestSpendCounter(
  owner: Player,
  crestName: string,
  counterName: string,
  amount = 1,
) {
  const crest = findCrest(owner, crestName);
  if (!crest) return false;
  const need = parseInt(amount as any, 10) || 0;
  const cur = parseInt(String(crest.counters?.[counterName] ?? 0), 10);
  if (cur < need) return false;
  if (!crest.counters) crest.counters = {};
  crest.counters[counterName] = cur - need;
  return true;
}

/** Start-of-turn countdown tick (unchanged behavior) */
export function tickCrests(owner: Player) {
  const crests = getCrests(owner);
  if (!Array.isArray(crests) || !crests.length) return [];

  // 1) Countdown left→right (visual order) and collect expirations
  const expiredIdx: number[] = [];
  const effectsToRun: Effect[] = [];

  for (let i = 0; i < crests.length; i++) {
    const c: any = crests[i];
    if (typeof c?.countdown !== "number" || !Number.isFinite(c.countdown)) continue;

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
  const crests = getCrestsHelper(state, owner);
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
  const crests = getCrests(owner);
  if (!crests) return [];
  const out: Effect[] = [];

  (state as any).__DEBUG_CREST_LOOP_STARTED = true;
  (state as any).__DEBUG_CREST_COUNT = crests.length;

  for (const crest of crests) {
    if (!Array.isArray(crest.triggers)) continue;
    for (const t of crest.triggers) {
      if (t.event !== event) continue;
      if (t.once_per_turn && t.usedThisTurn) continue;
      if (t.effects?.length) out.push(...t.effects);
      if (t.once_per_turn) t.usedThisTurn = true;
    }
  }
  return out;
}

export function completeCrest(crest: Crest, owner: Player, context: any = {}) {
  if (!crest) return;
  const list = getCrests(owner);
  if (!Array.isArray(list) || !list.includes(crest)) return; // already gone

  logEvent("crestComplete", { owner, crest: crest.name });

  // Pay out the crest's reward/effects
  if (Array.isArray(crest.effects) && crest.effects.length) {
    runEffects([...crest.effects], owner, null, context);
  }

  // Remove the crest so start-of-turn doesn’t fire it again
  const idx = list.indexOf(crest);
  if (idx !== -1) list.splice(idx, 1);
  // Render removed - UI layer
}

/**
 * Remove a specific crest by name from the owner.
 * NOTE: Does NOT trigger Last Words - use destroyCrestWithLastWord for that.
 */
export function removeCrest(owner: Player, crestName: string) {
  const list = getCrests(owner);
  if (!Array.isArray(list)) return;

  const idx = list.findIndex((c) => c.name === crestName);
  if (idx !== -1) {
    list.splice(idx, 1);
    // Render removed - UI layer
  }
}

/**
 * Destroy a crest, triggering its Last Words effects if present.
 * 
 * Like follower/amulet death: destroy → Last Words fire automatically if present.
 * No separate "WithLastWord" variant needed.
 * 
 * Last Words trigger when:
 * 1. Crest has "Last Words" in its keywords array, OR
 * 2. Crest description contains "Last Words:"
 */
export function destroyCrest(owner: Player, crestName: string) {
  const list = getCrests(owner);
  if (!Array.isArray(list)) return;

  const crest = findCrest(owner, crestName);
  if (!crest) return;

  logEvent("crestDestroy", { owner, crest: crestName });

  // Check if crest has Last Words keyword (same pattern as followers/amulets)
  // Accepts: string "LastWords"/"lastwords" OR object {name: "LastWords"}
  const hasLastWords =
    (Array.isArray(crest.keywords) &&
      crest.keywords.some((k: any) =>
        (typeof k === "string" && k.toLowerCase() === "lastwords") ||
        (typeof k === "object" && k !== null && k.name === "LastWords")
      )) ||
    (crest.description &&
      crest.description.toLowerCase().includes("last words"));

  // Trigger Last Words effects
  if (hasLastWords && Array.isArray(crest.effects) && crest.effects.length) {
    logEvent("crestLastWords", { owner, crest: crestName, effectCount: crest.effects.length });
    runEffects([...crest.effects], owner, null);
  }

  // Remove crest from list
  const idx = list.indexOf(crest);
  if (idx !== -1) list.splice(idx, 1);
  // Render removed - UI layer
}

/**
 * Advance (reduce) the countdown of a specific crest.
 */
export function crestAdvanceCountdown(
  owner: Player,
  crestName: string,
  amount: number = 1,
) {
  const crest = findCrest(owner, crestName);
  if (!crest || !Number.isFinite(crest.countdown)) return;

  (crest as any).countdown -= amount;

  if ((crest as any).countdown <= 0) {
    completeCrest(crest, owner);
  } else {
    // Render removed - UI layer
  }
}

/**
 * Increase the countdown of ALL crests for a player.
 * Used by effects that delay crest completion.
 */
export function crestIncreaseCountdown(owner: Player, amount: number = 1) {
  const crests = getCrests(owner);
  if (!Array.isArray(crests)) return;

  for (const crest of crests) {
    if (Number.isFinite(crest.countdown)) {
      crest.countdown = Math.max(0, (Number(crest.countdown) || 0) + amount);
      logEvent("countdownChange", {
        card: crest?.name,
        owner,
        value: crest.countdown,
      });
    }
  }
  // Render removed - UI layer
}















