/**
 * Reactive trigger queue + unified resolution sequence (rulebook L194/L209).
 *
 * TriggerEventName classification (owner ruling 2026-09-05):
 *
 * NON-REACTIVE (fire synchronously via fireTriggerImmediate / dispatchEvent):
 * - start_of_turn, end_of_turn — turn-boundary two-phase queue (turnBoundary.ts)
 * - strike, follower_strike, leader_strike, clash — combat sequence (combat.ts)
 * - ally_follower_attacked, enemy_follower_attacked, leader_attacked — combat watchers
 * - self_damaged — when combatResolutionDepth > 0 (combat damage batch flush)
 *
 * REACTIVE when _runEffectsDepth > 0 or a targeted-op handler is active (queued,
 * conditions judged at enqueue):
 * - ally_follower_enter, enemy_follower_enter
 * - ally_follower_played
 * - ally_follower_leaves_field, enemy_follower_leaves_field
 * - ally_ward_destroyed
 * - enemy_follower_defense_down
 * - ally_evolve, ally_super_evolve, enemy_super_evolve
 * - enhanced_play, ally_spell_played, ally_card_played, ally_draw, when_drawn
 * - ally_amulet_destroyed
 * - engage, on_fuse, loot_fused, loot_played, ally_earth_rite, invoke, select_mode
 * - leader_damaged, leader_restored
 * - self_damaged — when raised outside combat sequence (_runEffectsDepth > 0)
 * - self_buffed_up
 *
 * NOT fireTrigger (effect lists, not triggers): Fanfare / Evolve / Super-Evolve /
 * Engage / Accelerate / Crystallize / Last Words bodies — runEffects, not queued here.
 */
import { state } from "../../../core/gameState.js";
import { isGameOver } from "../../../core/gameOver.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "./types.js";
import type { QueuedTriggerEntry } from "./process.js";
import { dispatchEvent } from "./dispatcher.js";
import { isTargetedOpDispatchActive } from "../targeting/guards.js";
import { resolveUid, resolveUidOnBoard } from "../../../core/uidResolver.js";
import { getCrests, getHand } from "../../../core/playerHelpers.js";
import { isDev, readEnv } from "../../../core/env.js";

export const MAX_RESOLUTION_QUEUE_LENGTH = 500;

/** Combat-sequence events keep synchronous timing when combatResolutionDepth > 0. */
export const COMBAT_SEQUENCE_EVENTS = new Set<TriggerEventName>([
  "strike",
  "follower_strike",
  "leader_strike",
  "clash",
  "ally_follower_attacked",
  "enemy_follower_attacked",
  "leader_attacked",
  "self_damaged",
]);

export const TURN_BOUNDARY_EVENTS = new Set<TriggerEventName>([
  "start_of_turn",
  "end_of_turn",
]);

export type DeathLeaveItem = {
  event: TriggerEventName;
  activePlayer: Player;
  leavingCardUid: string;
  leavingOwner: Player;
  /** @deprecated Stale clone fallback — prefer leavingCardUid at drain. */
  context?: TriggerContext;
};

export type DeathLwItem = {
  cardUid: string;
  owner: Player;
  /** @deprecated Stale clone fallback — prefer cardUid at drain. */
  card?: CardInstance;
};

export type ReactiveQueueItem = {
  kind: "reactive";
  event: TriggerEventName;
  activePlayer: Player;
  entries: QueuedTriggerEntry[];
  /** Resume index when an interactive op pauses mid-group. */
  resumeAt?: number;
};

export type DeathLeaveQueueItem = {
  kind: "death_leave";
  items: DeathLeaveItem[];
};

export type DeathLwQueueItem = {
  kind: "death_lw";
  items: DeathLwItem[];
};

export type ResolutionQueueItem =
  | ReactiveQueueItem
  | DeathLeaveQueueItem
  | DeathLwQueueItem;

export function getRunEffectsDepth(): number {
  return ((state as any)._runEffectsDepth ?? 0) as number;
}

export function shouldQueueReactiveTrigger(
  eventName: TriggerEventName,
): boolean {
  if ((state as any).turnBoundaryInvokePhase && eventName === "invoke") {
    return true;
  }

  if (getRunEffectsDepth() <= 0 && !isTargetedOpDispatchActive()) return false;
  if (TURN_BOUNDARY_EVENTS.has(eventName)) return false;

  const combatDepth = ((state as any).combatResolutionDepth ?? 0) as number;
  if (combatDepth > 0 && COMBAT_SEQUENCE_EVENTS.has(eventName)) return false;

  return true;
}

export function getResolutionQueue(): ResolutionQueueItem[] {
  if (!(state as any)._resolutionQueue) {
    (state as any)._resolutionQueue = [];
  }
  return (state as any)._resolutionQueue as ResolutionQueueItem[];
}

export function clearResolutionQueue(): void {
  (state as any)._resolutionQueue = [];
}

/** Re-bind queued card refs to live zone instances (staged enter groups after Fanfare). */
export function refreshResolutionQueueCardRefs(
  queue: ResolutionQueueItem[],
): void {
  for (const item of queue) {
    if (item.kind === "reactive") {
      for (const entry of item.entries) {
        const uid = entry.cardUid ?? entry.card?.uid;
        if (!uid) continue;
        const live = resolveUid(uid);
        if (live) entry.card = live;
      }
    } else if (item.kind === "death_lw") {
      for (const lw of item.items) {
        const uid = lw.cardUid;
        if (!uid) continue;
        const live = resolveUid(uid);
        if (live) lw.card = live;
      }
    }
  }
}

/** Dev/test: queued card refs must match the live zone instance when one exists. */
export function assertResolutionQueueCardIdentity(
  queue: ResolutionQueueItem[],
  opts?: { throwOnStale?: boolean },
): void {
  const throwOnStale =
    opts?.throwOnStale ??
    (isDev() || readEnv("VITEST") === "true" || readEnv("VITEST") === "1");
  if (!throwOnStale) return;

  for (const item of queue) {
    if (item.kind === "death_lw") {
      for (const lw of item.items) {
        const uid = lw.cardUid;
        if (!uid || !lw.card) continue;
        const live = resolveUid(uid);
        if (live && lw.card !== live) {
          throw new Error(
            `[Triggers] stale death_lw card identity for uid ${uid}`,
          );
        }
      }
    } else if (item.kind === "reactive") {
      for (const entry of item.entries) {
        const uid = entry.cardUid ?? entry.card?.uid;
        if (!uid || !entry.card) continue;
        const live = resolveUid(uid);
        if (live && entry.card !== live) {
          throw new Error(
            `[Triggers] stale reactive queue card identity for uid ${uid} (${entry.event})`,
          );
        }
      }
    }
  }
}

export function assertLiveResolutionQueueCardIdentity(): void {
  assertResolutionQueueCardIdentity(getResolutionQueue());
}

export type ResolutionHistoryEntry = {
  cardName: string;
  event: string;
  owner: string;
};

const GUARD_HISTORY_LIMIT = 20;

/** Recent resolution queue entries for guard diagnostics (newest first). */
export function recentResolutionHistoryForGuard(
  limit = GUARD_HISTORY_LIMIT,
): ResolutionHistoryEntry[] {
  const history: ResolutionHistoryEntry[] = [];
  const q = getResolutionQueue();
  for (let i = q.length - 1; i >= 0 && history.length < limit; i--) {
    const item = q[i]!;
    if (item.kind === "reactive") {
      for (
        let j = item.entries.length - 1;
        j >= 0 && history.length < limit;
        j--
      ) {
        const entry = item.entries[j];
        const n = entry?.card?.name;
        if (!n) continue;
        history.push({
          cardName: n,
          event: entry.event ?? item.event,
          owner: entry.owner,
        });
      }
    } else if (item.kind === "death_lw") {
      for (
        let j = item.items.length - 1;
        j >= 0 && history.length < limit;
        j--
      ) {
        const lw = item.items[j]!;
        const n = resolveDeathLwCard(lw)?.name;
        if (!n) continue;
        history.push({
          cardName: n,
          event: "death_lw",
          owner: lw.owner,
        });
      }
    } else if (item.kind === "death_leave") {
      for (
        let j = item.items.length - 1;
        j >= 0 && history.length < limit;
        j--
      ) {
        const leave = item.items[j]!;
        const uid = leave.leavingCardUid;
        if (!uid) continue;
        const n = resolveUid(uid)?.name;
        if (!n) continue;
        history.push({
          cardName: n,
          event: leave.event,
          owner: leave.leavingOwner,
        });
      }
    }
  }
  return history;
}

/** @deprecated Use recentResolutionHistoryForGuard — card names only, for callers that need it. */
export function recentCardNamesForGuard(limit = GUARD_HISTORY_LIMIT): string[] {
  return recentResolutionHistoryForGuard(limit).map((e) => e.cardName);
}

export function formatResolutionHistoryForGuard(
  history: ResolutionHistoryEntry[],
): string {
  if (history.length === 0) return "n/a";
  return history
    .map((e) => `${e.cardName} (${e.event}, ${e.owner})`)
    .join("; ");
}

function assertQueueLengthGuard(eventName?: TriggerEventName): void {
  const q = getResolutionQueue();
  if (q.length < MAX_RESOLUTION_QUEUE_LENGTH) return;
  const history = recentResolutionHistoryForGuard();
  const msg =
    `[Triggers] Resolution queue exceeded ${MAX_RESOLUTION_QUEUE_LENGTH}. ` +
    `Event: ${eventName ?? "unknown"}. Recent history: ${formatResolutionHistoryForGuard(history)}. ` +
    `This indicates an infinite loop in trigger effects.`;
  console.error(msg);
  throw new Error(msg);
}

export function enqueueReactiveTriggerGroup(
  event: TriggerEventName,
  activePlayer: Player,
  entries: QueuedTriggerEntry[],
): void {
  if (entries.length === 0) return;
  assertQueueLengthGuard(event);
  getResolutionQueue().push({
    kind: "reactive",
    event,
    activePlayer,
    entries,
  });
}

export function enqueueDeathLeaveGroup(items: DeathLeaveItem[]): void {
  if (items.length === 0) return;
  assertQueueLengthGuard();
  getResolutionQueue().push({ kind: "death_leave", items });
}

export function enqueueDeathLwGroup(items: DeathLwItem[]): void {
  if (items.length === 0) return;
  assertQueueLengthGuard();
  getResolutionQueue().push({ kind: "death_lw", items });
}

/** Collect reactive triggers for an event (conditions judged at collection). */
export function collectReactiveTriggers(
  eventName: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
): QueuedTriggerEntry[] {
  const entries: QueuedTriggerEntry[] = [];
  (state as any)._reactiveCollector = entries;
  try {
    dispatchEvent(eventName, activePlayer, context);
  } finally {
    delete (state as any)._reactiveCollector;
  }
  return entries;
}

export function resolveDeathLwCard(item: DeathLwItem): CardInstance | null {
  const live = resolveUid(item.cardUid);
  if (live) return live;
  const stale = item.card;
  if (stale?.uid === item.cardUid) return stale;
  return null;
}

export function resolveDeathLeaveContext(item: DeathLeaveItem): TriggerContext {
  const card = resolveUid(item.leavingCardUid);
  if (card) {
    return {
      leavingCard: card,
      leavingOwner: item.leavingOwner,
      leavingCardUid: item.leavingCardUid,
    };
  }
  const stale = item.context?.leavingCard;
  if (stale?.uid === item.leavingCardUid) {
    return {
      ...item.context,
      leavingCard: stale,
      leavingOwner: item.leavingOwner,
    };
  }
  return {
    leavingOwner: item.leavingOwner,
    leavingCardUid: item.leavingCardUid,
  };
}

export function resolveQueuedTriggerCard(entry: {
  cardUid?: string;
  card?: any;
}): any {
  if (entry.cardUid) {
    const live = resolveUid(entry.cardUid);
    if (live) return live;
  }
  return entry.card ?? null;
}

/**
 * Resolution-start check (JP spec 2026-09-06): non-Last-Words queued abilities
 * require the source crest / board card to still be in the leader area or field.
 */
export function isQueuedTriggerSourceInPlay(entry: {
  source: string;
  owner: Player;
  cardUid?: string;
  card?: any;
}): boolean {
  const { source, owner, cardUid, card } = entry;

  if (source === "crest") {
    const crests = getCrests(state, owner) || [];
    if (card && crests.includes(card)) return true;
    const name = card?.name;
    if (name) {
      return crests.some(
        (c) => String(c.name).toLowerCase() === String(name).toLowerCase(),
      );
    }
    return false;
  }

  if (source === "board") {
    const uid = cardUid ?? card?.uid;
    return uid ? resolveUidOnBoard(uid) !== null : false;
  }

  if (source === "hand") {
    const uid = cardUid ?? card?.uid;
    if (!uid) return false;
    return getHand(state, owner).some((c) => c?.uid === uid);
  }

  const uid = cardUid ?? card?.uid;
  return uid ? resolveUidOnBoard(uid) !== null : false;
}

/** Synchronous trigger dispatch — used at drain time and for non-reactive events. */
export function fireTriggerImmediate(
  eventName: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext = {},
): void {
  if (isGameOver()) return;
  dispatchEvent(eventName, activePlayer, context);
}
