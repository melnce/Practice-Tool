/**
 * Floating damage/heal numbers — presentation only.
 *
 * Events are captured by tailing the existing game log (logEvent output) so we
 * never touch game logic or state mutation order. Undo/redo/position restore
 * suppress floaters and advance the log cursor without spawning text.
 */

import { getLogs } from "../core/logger.js";
import { onHistoryEvent } from "../core/history.js";
import type { Player } from "../core/types/index.js";

const STORAGE_KEY = "svwb.floatingCombatText";
export const FLOATING_COMBAT_TEXT_TOGGLE_ID = "floatingCombatTextToggle";

const STAGGER_MS = 130;
const MAX_FLOATERS_PER_TARGET = 4;
const FALLBACK_REMOVE_MS = 2500;

type FloaterKind = "damage" | "heal";

interface CombatFloaterEvent {
  kind: FloaterKind;
  targetKey: string;
  amount: number;
}

interface LogEntry {
  id: number;
  type: string;
  details?: Record<string, unknown>;
}

let lastProcessedLogId = 0;
let suppressFloaters = true;
const activeByTarget = new Map<string, Set<HTMLElement>>();
const pendingStaggerByTarget = new Map<string, number>();
let fallbackTimerCount = 0;

function isEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

export function setFloatingCombatTextEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isFloatingCombatTextEnabled(): boolean {
  return isEnabled();
}

function leaderElement(player: Player): HTMLElement | null {
  return document.getElementById(
    player === "first" ? "blueLeader" : "redLeader",
  );
}

function followerElement(uid: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.card[data-uid="${uid}"]`);
}

function resolveHost(targetKey: string): HTMLElement | null {
  if (targetKey.startsWith("leader:")) {
    const player = targetKey.slice("leader:".length) as Player;
    return leaderElement(player);
  }
  if (targetKey.startsWith("follower:")) {
    return followerElement(targetKey.slice("follower:".length));
  }
  return null;
}

function trackFloater(targetKey: string, el: HTMLElement): void {
  let set = activeByTarget.get(targetKey);
  if (!set) {
    set = new Set();
    activeByTarget.set(targetKey, set);
  }
  set.add(el);
}

function untrackFloater(targetKey: string, el: HTMLElement): void {
  const set = activeByTarget.get(targetKey);
  if (!set) return;
  set.delete(el);
  if (set.size === 0) activeByTarget.delete(targetKey);
}

function removeFloater(targetKey: string, el: HTMLElement): void {
  if (!el.isConnected) {
    untrackFloater(targetKey, el);
    return;
  }
  el.remove();
  untrackFloater(targetKey, el);
}

function scheduleRemoval(targetKey: string, el: HTMLElement): void {
  const onEnd = (ev: AnimationEvent) => {
    if (ev.target !== el) return;
    el.removeEventListener("animationend", onEnd);
    removeFloater(targetKey, el);
  };
  el.addEventListener("animationend", onEnd);

  fallbackTimerCount += 1;
  window.setTimeout(() => {
    fallbackTimerCount -= 1;
    removeFloater(targetKey, el);
  }, FALLBACK_REMOVE_MS);
}

function activeCount(targetKey: string): number {
  return activeByTarget.get(targetKey)?.size ?? 0;
}

function spawnFloater(event: CombatFloaterEvent, stackIndex: number): void {
  if (!isEnabled()) return;
  if (event.amount <= 0) return;
  if (activeCount(event.targetKey) >= MAX_FLOATERS_PER_TARGET) return;

  const host = resolveHost(event.targetKey);
  if (!host) return;

  const el = document.createElement("span");
  el.className = `floating-combat-text floating-combat-text--${event.kind}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "off");
  el.textContent = `${event.kind === "heal" ? "+" : "-"}${event.amount}`;
  el.style.setProperty("--float-stack-index", String(stackIndex));
  el.style.setProperty("--float-stagger", `${stackIndex * STAGGER_MS}ms`);

  host.appendChild(el);
  trackFloater(event.targetKey, el);
  scheduleRemoval(event.targetKey, el);

  if (event.kind === "damage" && event.targetKey.startsWith("follower:")) {
    host.classList.add("floating-combat-flash");
    window.setTimeout(() => {
      host.classList.remove("floating-combat-flash");
    }, 500);
  }
}

function extractEvents(logs: LogEntry[]): CombatFloaterEvent[] {
  const events: CombatFloaterEvent[] = [];

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    if (!entry) continue;
    const details = entry.details ?? {};
    const type = entry.type;

    if (type === "restoreLeader") {
      const amount = Number(details.amount) || 0;
      const player = details.player as Player;
      if (amount > 0 && player) {
        events.push({
          kind: "heal",
          targetKey: `leader:${player}`,
          amount,
        });
      }
      continue;
    }

    if (type === "restoreFollower") {
      const amount = Number(details.restored) || 0;
      const uid = String(details.uid ?? "");
      if (amount > 0 && uid) {
        events.push({
          kind: "heal",
          targetKey: `follower:${uid}`,
          amount,
        });
      }
      continue;
    }

    if (type === "damage") {
      const amount = Number(details.dealt) || 0;
      const uid = String(details.targetUid ?? "");
      if (amount > 0 && uid) {
        events.push({
          kind: "damage",
          targetKey: `follower:${uid}`,
          amount,
        });
      }
      continue;
    }

    if (type === "leaderDamage") {
      const owner = details.owner as Player;
      if (!owner) continue;

      let cursor = i + 1;
      const next = logs[cursor];
      if (next?.type === "leaderBarrierPop" && next.details?.owner === owner) {
        i = cursor;
        continue;
      }

      let amount = Number(details.amount) || 0;
      while (cursor < logs.length) {
        const peek = logs[cursor];
        if (!peek) break;
        if (
          peek.type === "leaderDamageResistMod" &&
          peek.details?.owner === owner
        ) {
          amount = Number(peek.details?.newAmount) || amount;
          cursor += 1;
          continue;
        }
        if (
          peek.type === "leaderDamageCapped" &&
          peek.details?.owner === owner
        ) {
          amount = Number(peek.details?.capped) || amount;
          cursor += 1;
          break;
        }
        break;
      }
      i = cursor - 1;

      if (amount > 0) {
        events.push({
          kind: "damage",
          targetKey: `leader:${owner}`,
          amount,
        });
      }
    }
  }

  return events;
}

function spawnFromEvents(events: CombatFloaterEvent[]): void {
  const perTargetStack = new Map<string, number>();

  for (const event of events) {
    const base = pendingStaggerByTarget.get(event.targetKey) ?? 0;
    const local = perTargetStack.get(event.targetKey) ?? 0;
    const stackIndex = base + local;
    spawnFloater(event, stackIndex);
    perTargetStack.set(event.targetKey, local + 1);
  }

  for (const [targetKey, count] of perTargetStack) {
    const prev = pendingStaggerByTarget.get(targetKey) ?? 0;
    pendingStaggerByTarget.set(targetKey, prev + count);
    window.setTimeout(
      () => {
        const cur = pendingStaggerByTarget.get(targetKey) ?? 0;
        const next = Math.max(0, cur - count);
        if (next === 0) pendingStaggerByTarget.delete(targetKey);
        else pendingStaggerByTarget.set(targetKey, next);
      },
      count * STAGGER_MS + FALLBACK_REMOVE_MS,
    );
  }
}

function advanceLogCursor(logs: LogEntry[]): void {
  if (logs.length === 0) return;
  const maxId = logs[logs.length - 1]?.id ?? lastProcessedLogId;
  if (maxId > lastProcessedLogId) lastProcessedLogId = maxId;
}

/** Called from render() after each paint. */
export function syncFloatingCombatTextFromLogs(): void {
  const logs = getLogs() as LogEntry[];
  const fresh = logs.filter((e) => e.id > lastProcessedLogId);

  if (suppressFloaters) {
    advanceLogCursor(logs);
    suppressFloaters = false;
    return;
  }

  if (!isEnabled() || fresh.length === 0) {
    advanceLogCursor(logs);
    return;
  }

  const events = extractEvents(fresh);
  advanceLogCursor(logs);
  if (events.length > 0) spawnFromEvents(events);
}

/** Suppress the next sync (undo/redo/reset/position load). */
export function suppressNextFloatingCombatText(): void {
  suppressFloaters = true;
}

export function initFloatingCombatTextHistoryHooks(): void {
  onHistoryEvent((ev) => {
    if (ev.type === "undo" || ev.type === "redo" || ev.type === "reset") {
      suppressNextFloatingCombatText();
    }
  });
}

export function armFloatingCombatTextBaseline(): void {
  const logs = getLogs() as LogEntry[];
  advanceLogCursor(logs);
  suppressFloaters = true;
}

/** Test helpers */
export function _resetFloatingCombatTextForTests(): void {
  for (const set of activeByTarget.values()) {
    for (const el of [...set]) el.remove();
  }
  activeByTarget.clear();
  pendingStaggerByTarget.clear();
  lastProcessedLogId = 0;
  suppressFloaters = true;
  fallbackTimerCount = 0;
}

export function _getActiveFloaterCount(): number {
  let n = 0;
  for (const set of activeByTarget.values()) n += set.size;
  return n;
}

export function _getFallbackTimerCount(): number {
  return fallbackTimerCount;
}

export function _spawnFloatingCombatTextForTest(
  event: CombatFloaterEvent,
  stackIndex = 0,
): void {
  spawnFloater(event, stackIndex);
}
