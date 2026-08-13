// src/logic/effects/crest.ts
import { state } from "../../core/gameState.js";
import { runEffects } from "../core/effects/index.js";
import { logEvent } from "../../core/logger.js";
import type { Effect, Player } from "../../core/types/index.js";
import {
  isFirstPlayer,
  opponentOf,
  getCrests as getCrestsHelper,
} from "../../core/playerHelpers.js";
import { allocateInsertionTs } from "../core/triggers/utils.js";

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
  // REMOVED: usedThisTurn - now uses __onceByTurn store pattern
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

  // REMOVED Phase 2: trigger? field - all cards migrated to triggers[]

  // Keywords (e.g., ["Last Words"])
  keywords?: string[];

  // Phase 1: Unified tracking store (same pattern as CardInstance)
  __onceByTurn?: Record<string, number>;
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

export function handleGainCrest(eff: Effect, owner: Player) {
  // NEW: allow giving to opponent
  const targetOwner =
    (eff as any).player === "opponent" ? opponentOf(owner) : owner;

  const crests = getCrestsHelper(state, targetOwner);
  const crestName = (eff as any).name?.trim();
  if (!crestName || crests.some((c) => c.name === crestName)) {
    console.warn(`[Crest] Crest "${crestName}" already active or invalid.`);
    return;
  }

  // Phase 2: Only use triggers array (singular trigger field removed)
  const triggers = (eff as any).triggers ?? [];

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
    triggers: (triggers || []).map(
      (t: any): CrestTrigger => ({
        event: t.event,
        type: t.type, // Include type field (e.g., "end_of_turn_own")
        effects: Array.isArray(t.effects) ? t.effects : [],
        once_per_turn: !!t.once_per_turn,
        // REMOVED: usedThisTurn initialization - uses crest.__onceByTurn now
        condition: t.condition ?? null,
      }),
    ),
    owner: targetOwner,
    // Keywords (e.g., ["LastWords"]) - needed for Last Words detection
    keywords: Array.isArray((eff as any).keywords) ? (eff as any).keywords : [],
    __onceByTurn: {}, // Initialize tracking store
    insertionTs: allocateInsertionTs(),
  } as Crest;

  crests.push(newCrest);
  logEvent("gainCrest", { owner: targetOwner, crest: crestName });

  // Run on_gain effects AFTER crest is successfully added
  const onGainEffects = Array.isArray((eff as any).on_gain)
    ? (eff as any).on_gain
    : [];
  if (onGainEffects.length > 0) {
    runEffects(onGainEffects, targetOwner, null, {});
  }
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

/**
 * Append trigger specs onto an existing crest (Faith payoffs, etc.).
 * Does not replace existing triggers — additive only.
 */
export function crestAppendTriggers(
  owner: Player,
  crestName: string,
  triggers: CrestTrigger[],
): boolean {
  const crest = findCrest(owner, crestName);
  if (!crest) return false;
  if (!Array.isArray(crest.triggers)) crest.triggers = [];
  for (const t of triggers || []) {
    if (!t) continue;
    const next: CrestTrigger = {
      effects: Array.isArray(t.effects) ? t.effects : [],
      once_per_turn: !!t.once_per_turn,
      condition: t.condition ?? null,
    };
    if (t.event !== undefined) next.event = t.event;
    if (t.type !== undefined) next.type = t.type;
    crest.triggers.push(next);
  }
  logEvent("crestAppendTriggers", {
    owner,
    crest: crestName,
    added: (triggers || []).length,
  });
  return true;
}

/**
 * Start-of-turn countdown tick.
 * When countdown reaches 0, the crest is DESTROYED (triggers Last Words if present).
 * Effects do NOT fire just because countdown completed - only Last Words triggers on destruction.
 */
export function tickCrests(owner: Player) {
  const crests = getCrests(owner);
  if (!Array.isArray(crests) || !crests.length) return;

  // Collect names of crests to destroy (can't modify array while iterating)
  const toDestroy: string[] = [];

  for (const c of crests) {
    if (typeof c?.countdown !== "number" || !Number.isFinite(c.countdown))
      continue;

    c.countdown -= 1;

    if (c.countdown <= 0) {
      logEvent("crestExpire", { owner, crest: c.name });
      toDestroy.push(c.name);
    }
  }

  // Destroy expired crests (this triggers Last Words if keyword present)
  for (const name of toDestroy) {
    destroyCrest(owner, name);
  }
}

/** NEW: reset once-per-turn gates at owner’s turn start */
export function resetCrestOncePerTurn(owner: Player) {
  const crests = getCrestsHelper(state, owner);
  if (!crests) return;
  for (const c of crests) {
    // Clear the __onceByTurn store (Phase 1 unified tracking)
    (c as any).__onceByTurn = {};
  }
}

/**
 * Phase 1: collect effects for a crest event using __onceByTurn store.
 * Returns a flat list of effects to be executed by runEffects(owner).
 */
export function processCrestEvent(owner: Player, event: string) {
  const crests = getCrests(owner);
  if (!crests) return [];
  const out: Effect[] = [];

  // Get current turn for tracking
  const currentTurn = (state as any).turnNumber ?? state.roundCount ?? 0;

  (state as any).__DEBUG_CREST_LOOP_STARTED = true;
  (state as any).__DEBUG_CREST_COUNT = crests.length;

  for (const crest of crests) {
    if (!Array.isArray(crest.triggers)) continue;

    // Ensure __onceByTurn store exists
    if (!(crest as any).__onceByTurn) {
      (crest as any).__onceByTurn = {};
    }
    const store = (crest as any).__onceByTurn as Record<string, number>;
    const triggers = crest.triggers;

    triggers.forEach((t, i) => {
      // Check event field first
      let isMatch = t.event === event;

      // Handle type shorthand (e.g., "end_of_turn_own")
      // "end_of_turn_own" means "end_of_turn" but only when it's the crest owner's turn
      if (!isMatch && t.type) {
        if (t.type === "end_of_turn_own" && event === "end_of_turn") {
          // Crest triggers are always processed for the owner, so this matches
          isMatch = true;
        } else if (
          t.type === "start_of_turn_own" &&
          event === "start_of_turn"
        ) {
          isMatch = true;
        } else if (t.type === event) {
          // Direct match on type field
          isMatch = true;
        }
      }

      if (!isMatch) return;

      // Check once_per_turn using store
      if (t.once_per_turn) {
        const key = `${event}_${i}`; // Unique key per trigger
        if (store[key] === currentTurn) return; // Already fired this turn
        store[key] = currentTurn; // Mark as fired
      }

      if (t.effects?.length) out.push(...t.effects);
    });
  }
  return out;
}

/** True if crest destruction should fire its effects payload (Last Words only). */
function crestHasLastWords(crest: Crest): boolean {
  // Accepts: string "LastWords"/"lastwords" OR object {name: "LastWords"}
  return (
    (Array.isArray(crest.keywords) &&
      crest.keywords.some(
        (k: any) =>
          (typeof k === "string" && k.toLowerCase() === "lastwords") ||
          (typeof k === "object" && k !== null && k.name === "LastWords"),
      )) ||
    (!!crest.description &&
      crest.description.toLowerCase().includes("last words"))
  );
}

/**
 * Countdown reached 0 (advance or tick). This is destruction, not a free payout:
 * effects fire only when the crest has Last Words (parity with destroyCrest / tickCrests).
 */
export function completeCrest(crest: Crest, owner: Player, context: any = {}) {
  if (!crest) return;
  const list = getCrests(owner);
  if (!Array.isArray(list) || !list.includes(crest)) return; // already gone

  logEvent("crestComplete", { owner, crest: crest.name });

  if (
    crestHasLastWords(crest) &&
    Array.isArray(crest.effects) &&
    crest.effects.length
  ) {
    logEvent("crestLastWords", {
      owner,
      crest: crest.name,
      effectCount: crest.effects.length,
    });
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
/** Banish every crest on a player (no Last Words — banish, not destroy). */
export function banishAllCrests(owner: Player) {
  const list = getCrests(owner);
  if (!Array.isArray(list) || list.length === 0) return;
  logEvent("crestBanishAll", { owner, count: list.length });
  list.length = 0;
}

export function destroyCrest(owner: Player, crestName: string) {
  const list = getCrests(owner);
  if (!Array.isArray(list)) return;

  const crest = findCrest(owner, crestName);
  if (!crest) return;

  logEvent("crestDestroy", { owner, crest: crestName });

  // Trigger Last Words effects (same gate as completeCrest / tickCrests)
  if (
    crestHasLastWords(crest) &&
    Array.isArray(crest.effects) &&
    crest.effects.length
  ) {
    console.log("[destroyCrest DEBUG] Crest Last Words firing:", {
      crestName,
      effectCount: crest.effects.length,
      effects: JSON.stringify(crest.effects),
      lastSummonedBefore: state.lastSummoned?.length || 0,
    });
    logEvent("crestLastWords", {
      owner,
      crest: crestName,
      effectCount: crest.effects.length,
    });
    runEffects([...crest.effects], owner, null);
    console.log(
      "[destroyCrest DEBUG] After effects, lastSummoned:",
      state.lastSummoned?.map((c: any) => c.name),
    );
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
