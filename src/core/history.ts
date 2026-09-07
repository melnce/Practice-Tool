// /gamelogic/history.ts
import { state } from "./gameState.js";
import { bumpActionSeq } from "./actionSeq.js";
import { adapter } from "./adapter.js";
import { logEvent } from "./logger.js";
import type { GameState } from "./types/index.js";
import { validateGameState } from "./stateValidation.js";
import { isHistoryDisabled } from "./env.js";
import type { ReplayStep } from "./stateHash.js";
import { hashGameState } from "./stateHash.js";
import type { CardInstance } from "./types/index.js";
import { isDev, readEnv } from "./env.js";
import { getResolutionQueue } from "../logic/core/triggers/queue.js";
import { isEffectResolutionPaused } from "../logic/core/resolutionPause.js";
import {
  resetTriggerChainDepth,
  getTriggerChainDepth,
} from "../logic/core/triggers.js";
import {
  endDispatch,
  isTargetedOpDispatchActive,
} from "../logic/core/targeting/guards.js";
import { INTERNAL_CACHE_KEYS } from "./snapshotEphemeralKeys.js";
import { resyncPendingTargetConfirmation } from "../logic/core/resolveTarget.js";
import { showPendingModePickerModal } from "../logic/effects/ops/mode.js";
// --- Config ---
const MAX_HISTORY = 200; // ring limit

// --- History Enable/Disable Switch ---
// When disabled, history skips expensive structuredClone for performance.
// Use DISABLE_HISTORY=1 env var or call setHistoryEnabled(false).
let _historyEnabled = true;
/** When true, actions run through history commit guards but do not push to past/future. */
let _historySuppressRecording = false;

/** Explicitly enable or disable history snapshots. */
export function setHistoryEnabled(enabled: boolean): void {
  _historyEnabled = enabled;
}

/** Check if history is currently enabled. */
export function isHistoryEnabled(): boolean {
  return _historyEnabled;
}

/** Suppress recording commits while still running commit-time guards (soak re-execute). */
export function setHistorySuppressRecording(suppress: boolean): void {
  _historySuppressRecording = suppress;
}

export function isHistorySuppressRecording(): boolean {
  return _historySuppressRecording;
}

// Check env var at module load (for benchmarks)
if (isHistoryDisabled()) {
  _historyEnabled = false;
}

// --- Types ---
interface HistoryEntry {
  name: string;
  before: GameState;
  after?: GameState;
  meta: any;
  before_hash?: string;
  after_hash?: string;
}

interface ActionContext {
  name: string;
  before: GameState | null; // null when history disabled (no snapshot taken)
  meta: any;
}

// --- Internals ---
let past: HistoryEntry[] = []; // stack of { name, before, after, meta }
let future: HistoryEntry[] = []; // stack of same
let inAction: ActionContext | null = null; // { name, before, meta }
let onChange:
  | ((status: { canUndo: boolean; canRedo: boolean }) => void)
  | null = null; // optional listener

export type HistoryEvent =
  | { type: "commit"; name: string; meta: unknown }
  | { type: "undo"; name: string; meta: unknown }
  | { type: "redo"; name: string; meta: unknown }
  | { type: "reset" };

type HistoryEventListener = (event: HistoryEvent) => void;
const historyEventListeners = new Set<HistoryEventListener>();

function emitHistoryEvent(event: HistoryEvent): void {
  for (const cb of historyEventListeners) {
    try {
      cb(event);
    } catch (e) {
      console.error("[History] event listener error", e);
    }
  }
}

/** Subscribe to commit/undo/redo/reset for script cursor sync etc. */
export function onHistoryEvent(cb: HistoryEventListener): () => void {
  historyEventListeners.add(cb);
  return () => {
    historyEventListeners.delete(cb);
  };
}
// --- Internal Cache Keys (excluded from snapshots) ---
// These are implementation details that should not pollute history.
// Add new cache keys here if needed.
// EXPORTED for testing - tests can verify no unexpected underscore keys appear.
export { INTERNAL_CACHE_KEYS } from "./snapshotEphemeralKeys.js";

/**
 * Snapshot-dropped keys that must be at default at every commit.
 * Proof class: set and cleared inside a synchronous try/finally; non-default at
 * commit means an existing proof stopped being true (gate fires by name).
 */
export const SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT: Readonly<
  Record<string, string>
> = {
  sotBoundaryDeferDrain:
    "Set/cleared inside runStartOfTurnBoundary try/finally only; non-default at commit means a prompt or pause leaked past the boundary window.",
  turnBoundaryInvokePhase:
    "Set/cleared in try/finally during invoke scan only (step 6, after sotBoundaryDeferDrain cleared).",
  _reactiveCollector:
    "Lives only inside collectReactiveTriggers synchronous collect+enqueue try/finally.",
  __resolutionDrainDepth:
    "Dev/test nested-drain counter; 0 outside active drain try/finally.",
  triggerChainDepth:
    "Incremented/decremented synchronously inside fireTrigger; 0 at commit boundary.",
  targetedOpDispatchActive:
    "Set/cleared by targeted-op dispatcher try/finally; false at commit.",
  playSequenceDepth:
    "Must be 0 at commit unless isEffectResolutionPaused() (fanfare/mode/target pause mid-Play Card). Non-zero without a pause means a completion path returned without endPlaySequenceDrain.",
};

/**
 * Snapshot-dropped keys allowed to be non-default at commit, with reason.
 */
export const SNAPSHOT_EPHEMERAL_MAY_BE_SET: Readonly<Record<string, string>> = {
  _stagedPlayEnterGroups:
    "Populated during an active play sequence before endPlaySequenceDrain; excluded from snapshots and cleared on restore.",
  _runEffectsDepth:
    "A paused commit can occur inside nested runEffects (mode-picker confirm). The counter describes a call stack that does not survive restore; resumption re-enters from a fresh top-level dispatch through resumeEffects, so restoring at 0 is correct.",
  deferDeathTriggers:
    "Combat/resolve doAction restores prevDefer in finally before commit; prevDefer may be true from outer runEffects.",
  _drainingResolutionQueue:
    "Re-entrancy guard during drain; assertResolutionQueueClearForCommit skips queue check while true.",
  _triggerCache:
    "Derived trigger-candidate cache; a populated cache is normal between commits.",
  __uiSelectable:
    "UI highlight on cards when a prompt is open; stripped from snapshots and re-applied on render.",
};

/** Combined proof rows (documentation + tests). */
export const SNAPSHOT_EPHEMERAL_ALLOWLIST: Readonly<Record<string, string>> = {
  ...SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT,
  ...SNAPSHOT_EPHEMERAL_MAY_BE_SET,
};

export type SnapshotDroppedProofClass = "a" | "b";

export interface SnapshotDroppedAuditRow {
  category: string;
  mechanism: string;
  proofClass: SnapshotDroppedProofClass;
  proof: string;
}

/**
 * Audit table: why each snapshot-dropped state class is safe (or tracked) at commit.
 * INTERNAL_CACHE_KEYS rows are enumerated in SNAPSHOT_EPHEMERAL_* allowlists above.
 */
export const SNAPSHOT_DROPPED_STATE_AUDIT: readonly SnapshotDroppedAuditRow[] =
  [
    {
      category: "Named internal caches",
      mechanism: "INTERNAL_CACHE_KEYS exclusion",
      proofClass: "a",
      proof:
        "Each key is classified must_be_default or may_be_set with a structural proof; gate asserts at commit.",
    },
    {
      category: "Module ephemerals",
      mechanism: "triggerChainDepth / targetedOpDispatchActive readers",
      proofClass: "a",
      proof:
        "Not on state root; read via getters and covered by must_be_default gate rows.",
    },
    {
      category: "Play sequence depth",
      mechanism: "INTERNAL_CACHE_KEYS exclusion",
      proofClass: "a",
      proof:
        "playSequenceDepth may be >0 at commit only when isEffectResolutionPaused() (paused Play Card); otherwise must be 0 or a drain path leaked.",
    },
    {
      category: "Functions / non-cloneable objects",
      mechanism: "dropped-function gate (absolute after #315)",
      proofClass: "b",
      proof:
        "Fuse confirm was gameplay state stored as pendingTargetEffect.confirmHook; structuredClone drops functions, so undo/redo/save-load silently lost confirm while targetUids survived (Confirm did nothing). #315 (confirmRegistry) replaced the closure with serializable keys (e.g. fuse:finalize:cards). No function may be reachable from pendingTargetEffect at commit.",
    },
  ];

/** Function paths snapshots drop — empty after #315; any entry must be a live finding. */
export const SNAPSHOT_DROPPED_FUNCTION_ALLOWLIST: Readonly<
  Record<string, string>
> = {};

const SNAPSHOT_WALK_MAX_NODES = 4096;
const SNAPSHOT_WALK_MAX_DEPTH = 14;

function collectFunctionPaths(
  roots: Array<{ label: string; value: unknown }>,
  maxNodes = SNAPSHOT_WALK_MAX_NODES,
  maxDepth = SNAPSHOT_WALK_MAX_DEPTH,
): Set<string> {
  const paths = new Set<string>();
  const seen = new Set<unknown>();
  let nodes = 0;

  const walk = (value: unknown, path: string, depth: number): void => {
    if (nodes >= maxNodes || depth > maxDepth) return;
    if (value === null || value === undefined) return;
    const t = typeof value;
    if (t === "function") {
      paths.add(path);
      return;
    }
    if (t !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    nodes += 1;

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    for (const key of Object.keys(value as object)) {
      walk((value as any)[key], `${path}.${key}`, depth + 1);
    }
  };

  for (const { label, value } of roots) {
    if (value !== undefined && value !== null) {
      walk(value, label, 0);
    }
  }
  return paths;
}

function snapshotFunctionWalkRoots(s: GameState): Array<{
  label: string;
  value: unknown;
}> {
  const roots: Array<{ label: string; value: unknown }> = [
    { label: "pendingTargetEffect", value: s.pendingTargetEffect },
    { label: "pendingModeChoice", value: s.pendingModeChoice },
    { label: "_resolutionQueue", value: (s as any)._resolutionQueue },
  ];
  for (const side of ["first", "second"] as const) {
    const pl = s.players?.[side];
    if (!pl) continue;
    for (const zone of ["board", "hand", "graveyard", "deck"] as const) {
      roots.push({ label: `players.${side}.${zone}`, value: pl[zone] });
    }
  }
  return roots;
}

/** Functions reachable from live snapshot roots that the snapshot layer drops. */
export function collectSnapshotDroppedFunctionViolations(
  live: GameState,
  snap: GameState,
): string[] {
  const liveFns = collectFunctionPaths(snapshotFunctionWalkRoots(live));
  const snapFns = collectFunctionPaths(snapshotFunctionWalkRoots(snap));
  const violations: string[] = [];
  for (const path of liveFns) {
    if (snapFns.has(path)) continue;
    if (SNAPSHOT_DROPPED_FUNCTION_ALLOWLIST[path]) continue;
    violations.push(path);
  }
  return violations;
}

function isSnapshotEphemeralDefault(value: unknown): boolean {
  return (
    value === undefined || value === null || value === false || value === 0
  );
}

function readSnapshotEphemeralValue(key: string): unknown {
  if (key === "triggerChainDepth") return getTriggerChainDepth();
  if (key === "targetedOpDispatchActive") return isTargetedOpDispatchActive();
  return (state as any)[key];
}

/** Collect snapshot-dropped state violations at commit time (dev/test gate). */
export function collectSnapshotEphemeralViolations(): string[] {
  const violations: string[] = [];
  const s = state as any;

  for (const key of Object.keys(SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT)) {
    if (key === "playSequenceDepth" && isEffectResolutionPaused()) continue;
    const value = readSnapshotEphemeralValue(key);
    if (!isSnapshotEphemeralDefault(value)) {
      violations.push(`${key} (must_be_default)`);
    }
  }

  for (const key of INTERNAL_CACHE_KEYS) {
    if (
      SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT[key] ||
      SNAPSHOT_EPHEMERAL_MAY_BE_SET[key]
    ) {
      continue;
    }
    const value = s[key];
    if (!isSnapshotEphemeralDefault(value)) {
      violations.push(`${key} (unclassified)`);
    }
  }

  return violations;
}

function assertNoDroppedSnapshotStateAtCommit(actionName: string): void {
  const violations = collectSnapshotEphemeralViolations();
  if (violations.length === 0) return;

  const msg =
    `[History] commitAction("${actionName}") with snapshot-dropped ephemeral state: ` +
    violations.join(", ");
  const vitest = readEnv("VITEST");
  const inTest = vitest === "true" || vitest === "1";
  if (isDev() || inTest) {
    throw new Error(msg);
  }
  console.warn(msg);
}

// --- Internal Cache Keys (excluded from snapshots) ---
// These are implementation details that should not pollute history.
// Add new cache keys in snapshotEphemeralKeys.ts and classify in
// SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT or SNAPSHOT_EPHEMERAL_MAY_BE_SET.

// Shallow hash already exists in your logger; if you have a fast state hash, reuse it.

export function resyncInteractivePromptsAfterHistoryRestore(): void {
  resyncPendingTargetConfirmation();
  if (state.pendingModeChoice) {
    showPendingModePickerModal();
  }
}

/** Snapshots strip uncommitted in-progress picks; committed per-pick prompts keep them. */
function sanitizePendingTargetInSnapshot(snap: GameState): void {
  const pending = snap.pendingTargetEffect;
  if (pending && !pending.picksAreCommitted) {
    pending.targetUids = [];
    if (Array.isArray(pending.targets)) {
      pending.targets = [];
    }
  }

  const modePending = snap.pendingModeChoice;
  if (modePending && !modePending.picksAreCommitted) {
    modePending.partialPickedIndices = [];
  }

  const seen = new Set<CardInstance>();
  const visit = (c: CardInstance | null | undefined) => {
    if (!c || seen.has(c)) return;
    seen.add(c);
    if ((c as any).__uiSelectable) delete (c as any).__uiSelectable;
  };

  for (const p of ["first", "second"] as const) {
    const pl = snap.players[p];
    for (const c of pl.board) visit(c);
    for (const c of pl.hand) visit(c);
    for (const c of pl.graveyard ?? []) visit(c);
  }
  if (pending && Array.isArray(pending.pool)) {
    for (const c of pending.pool) visit(c);
  }
}

/** Dev/test footprint of engine state excluded from snapshots or reset on restore. */
export function getEngineEphemeralFootprint() {
  const q = getResolutionQueue();
  return {
    resolutionQueueLen: q.length,
    resolutionQueueKinds: q.map((item) =>
      item.kind === "reactive"
        ? `reactive:${item.event}(${item.entries.length})`
        : `${item.kind}(${item.items.length})`,
    ),
    deferDeathTriggers: !!(state as any).deferDeathTriggers,
    runEffectsDepth: (state as any)._runEffectsDepth ?? 0,
    drainingResolutionQueue: !!(state as any)._drainingResolutionQueue,
    resolutionDrainDepth: (state as any).__resolutionDrainDepth ?? 0,
    hasReactiveCollector: !!(state as any)._reactiveCollector,
    hasTriggerCache: !!(state as any)._triggerCache,
  };
}

function assertSnapshotPreservesCommittedPromptFields(snap: GameState): void {
  const issues: string[] = [];
  const livePending = state.pendingTargetEffect;
  const snapPending = snap.pendingTargetEffect;
  if (livePending && snapPending) {
    const committed = livePending.picksAreCommitted === true;
    const liveUids = livePending.targetUids ?? [];
    const snapUids = snapPending.targetUids ?? [];
    if (committed) {
      if (JSON.stringify(liveUids) !== JSON.stringify(snapUids)) {
        issues.push("pendingTargetEffect.targetUids");
      }
      const liveTargets = livePending.targets ?? [];
      const snapTargets = snapPending.targets ?? [];
      if (
        liveTargets.length > 0 &&
        JSON.stringify(liveTargets.map((t) => t?.uid)) !==
          JSON.stringify(snapTargets.map((t) => t?.uid))
      ) {
        issues.push("pendingTargetEffect.targets");
      }
    } else {
      if (snapUids.length > 0) {
        issues.push("pendingTargetEffect.targetUids (uncommitted must clear)");
      }
      const snapTargets = snapPending.targets ?? [];
      if (snapTargets.length > 0) {
        issues.push("pendingTargetEffect.targets (uncommitted must clear)");
      }
    }
  }
  const liveMode = state.pendingModeChoice;
  const snapMode = snap.pendingModeChoice;
  if (liveMode && snapMode) {
    const committed = liveMode.picksAreCommitted === true;
    const livePartial = liveMode.partialPickedIndices ?? [];
    const snapPartial = snapMode.partialPickedIndices ?? [];
    if (committed) {
      if (JSON.stringify(livePartial) !== JSON.stringify(snapPartial)) {
        issues.push("pendingModeChoice.partialPickedIndices");
      }
    } else if (snapPartial.length > 0) {
      issues.push(
        "pendingModeChoice.partialPickedIndices (uncommitted must clear)",
      );
    }
  }
  if (issues.length === 0) return;

  const msg = `[History] snapshot prompt pick mismatch: ${issues.join(", ")}`;
  const vitest = readEnv("VITEST");
  const inTest = vitest === "true" || vitest === "1";
  if (isDev() || inTest) {
    throw new Error(msg);
  }
  console.warn(msg);
}

function assertSnapshotPreservesResolutionQueue(
  liveLen: number,
  snapLen: number,
): void {
  if (liveLen === 0) return;
  const vitest = readEnv("VITEST");
  const inTest = vitest === "true" || vitest === "1";
  if (!isDev() && !inTest) return;
  if (snapLen >= liveLen) return;
  throw new Error(
    `[History] snapshot dropped resolution queue entries (live=${liveLen}, snap=${snapLen}); ` +
      `limbo death_lw corpses will orphan on restore`,
  );
}

function assertSnapshotDroppedFunctions(
  live: GameState,
  snap: GameState,
): void {
  const violations = collectSnapshotDroppedFunctionViolations(live, snap);
  if (violations.length === 0) return;

  const msg = `[History] snapshot dropped gameplay function(s): ${violations.join(", ")}`;
  const vitest = readEnv("VITEST");
  const inTest = vitest === "true" || vitest === "1";
  if (isDev() || inTest) {
    throw new Error(msg);
  }
  console.warn(msg);
}

function finalizeLiveSnapshot(snap: GameState): void {
  sanitizePendingTargetInSnapshot(snap);
  assertSnapshotPreservesCommittedPromptFields(snap);
  assertSnapshotPreservesResolutionQueue(
    getResolutionQueue().length,
    ((snap as any)._resolutionQueue ?? []).length,
  );
  assertSnapshotDroppedFunctions(state, snap);
}

function snapshot(): GameState {
  // Exclude RNG (has methods, must be handled separately) and internal caches
  const { rng, ...rest } = state as any;

  // Remove only explicit internal cache keys (not blanket underscore filtering)
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!INTERNAL_CACHE_KEYS.has(k)) {
      cleaned[k] = v;
    }
  }

  // Try structuredClone first
  try {
    const snap = structuredClone(cleaned) as GameState;
    // Persist RNG internal state (seed, cursor, uidCounter)
    if (rng && typeof rng.snapshot === "function") {
      (snap as any).__rng = rng.snapshot();
    }
    finalizeLiveSnapshot(snap);
    return snap;
  } catch (e) {
    // Fallback: manually clone, skipping non-cloneable properties
    console.warn("[History] structuredClone failed, using fallback. Error:", e);
    return manualSnapshot(cleaned, rng, true);
  }
}

function manualSnapshot(rest: any, rng: any, fromLiveState = false): GameState {
  const snap: any = {};

  for (const key of Object.keys(rest)) {
    const val = rest[key];

    // Skip functions
    if (typeof val === "function") {
      console.warn(`[History] Skipping non-cloneable function at key: ${key}`);
      continue;
    }

    // Skip undefined
    if (val === undefined) continue;

    // For arrays, deep clone each element, skipping functions
    if (Array.isArray(val)) {
      snap[key] = val.map((item, idx) => cloneItem(item, `${key}[${idx}]`));
    }
    // For objects, try structured clone on each
    else if (val !== null && typeof val === "object") {
      try {
        snap[key] = structuredClone(val);
      } catch {
        console.warn(
          `[History] structuredClone failed for key ${key}, cloning manually`,
        );
        snap[key] = cloneItem(val, key);
      }
    }
    // Primitives: copy directly
    else {
      snap[key] = val;
    }
  }

  // Persist RNG internal state
  if (rng && typeof rng.snapshot === "function") {
    snap.__rng = rng.snapshot();
  }

  if (fromLiveState) {
    finalizeLiveSnapshot(snap as GameState);
  } else {
    sanitizePendingTargetInSnapshot(snap as GameState);
  }
  return snap as GameState;
}

function cloneItem(item: any, path: string): any {
  if (item === null || item === undefined) return item;
  if (typeof item === "function") {
    console.warn(`[History] Skipping function in array at: ${path}`);
    return null;
  }
  if (typeof item !== "object") return item;

  try {
    return structuredClone(item);
  } catch {
    // Object has non-cloneable properties - clone manually
    const clone: any = Array.isArray(item) ? [] : {};
    for (const key of Object.keys(item)) {
      const val = item[key];
      if (typeof val === "function") {
        console.warn(`[History] Skipping function at: ${path}.${key}`);
        continue;
      }
      if (val === null || val === undefined || typeof val !== "object") {
        clone[key] = val;
      } else {
        clone[key] = cloneItem(val, `${path}.${key}`);
      }
    }
    return clone;
  }
}

function replaceState(next: GameState) {
  // Preserve the RNG instance
  const rngInstance = state.rng;

  // Replace all top-level keys to keep references stable where possible
  // (prevents modules holding "state" reference from becoming stale).
  for (const k of Object.keys(state)) delete state[k];
  for (const [k, v] of Object.entries(next)) {
    if (k !== "rng") state[k] = v;
  }

  // Re-attach RNG instance
  state.rng = rngInstance;

  // restore RNG state after state rehydrate
  if (state.rng && (next as any).__rng) {
    state.rng.restore((next as any).__rng);
  }
  // __rng is snapshot-only metadata — never leave it on the live state root
  delete (state as any).__rng;

  resetEphemeralStateAfterRestore();
}

/** Clear transient engine state excluded from snapshots — must not survive restore. */
function resetEphemeralStateAfterRestore(): void {
  (state as any).deferDeathTriggers = false;
  (state as any)._runEffectsDepth = 0;
  (state as any)._drainingResolutionQueue = false;
  (state as any).__resolutionDrainDepth = 0;
  (state as any)._triggerCache = null;
  (state as any).playSequenceDepth = 0;
  delete (state as any)._stagedPlayEnterGroups;
  delete (state as any)._reactiveCollector;
  resetTriggerChainDepth();
  endDispatch();
}

/**
 * Capture a deep clone of the current game state for undo, save, or checkpoint.
 * RNG is stored as plain `__rng` metadata (seed/cursor/uidCounter), not the live instance.
 */
export function captureSnapshot(): GameState {
  return snapshot();
}

/**
 * Clone a snapshot so applying it does not alias the caller's stored copy into live state.
 */
function cloneSnapshot(snap: GameState): GameState {
  const rngMeta = (snap as any).__rng;
  const { rng: _rng, __rng: _ignored, ...rest } = snap as any;
  void _rng;
  void _ignored;
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!INTERNAL_CACHE_KEYS.has(k)) {
      cleaned[k] = v;
    }
  }
  try {
    const clone = structuredClone(cleaned) as GameState;
    if (rngMeta) {
      (clone as any).__rng = {
        seed: rngMeta.seed,
        cursor: rngMeta.cursor,
        uidCounter: rngMeta.uidCounter,
      };
    }
    sanitizePendingTargetInSnapshot(clone);
    return clone;
  } catch (e) {
    console.warn(
      "[History] structuredClone failed in cloneSnapshot, using fallback. Error:",
      e,
    );
    const clone = manualSnapshot(cleaned, null);
    if (rngMeta) {
      (clone as any).__rng = {
        seed: rngMeta.seed,
        cursor: rngMeta.cursor,
        uidCounter: rngMeta.uidCounter,
      };
    }
    sanitizePendingTargetInSnapshot(clone);
    return clone;
  }
}

export interface ApplySnapshotOptions {
  autoRender?: boolean;
  /** When true (default), clear undo/redo so the applied position is the new floor. */
  resetHistory?: boolean;
}

/**
 * Replace live state with a snapshot (save load, checkpoint restore, etc.).
 * Clones first so the stored snapshot is not mutated by subsequent play.
 */
export function applySnapshot(
  next: GameState,
  options: ApplySnapshotOptions = {},
): void {
  const { autoRender = true, resetHistory: shouldResetHistory = true } =
    options;
  if (isInAction()) {
    abortAction({ autoRender: false });
  }
  replaceState(cloneSnapshot(next));
  if (shouldResetHistory) {
    resetHistory();
  }
  resyncInteractivePromptsAfterHistoryRestore();
  const suppress =
    (globalThis as any).HEADLESS === true ||
    (globalThis as any).AI_SUPPRESS_RENDER === true;
  if (autoRender && !suppress) adapter.render();
  notify();
}

function trimRing() {
  if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY);
}

function notify() {
  if (typeof onChange === "function")
    onChange({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

// --- Public API ---

/** Begin an action. Wrap mutations between beginAction/commitAction OR use doAction(). */
export function beginAction(name: string, meta: any = {}) {
  if (inAction) {
    // Recover instead of bricking the session — one bad action must not wedge history.
    console.warn(
      `[History] beginAction("${name}") while "${inAction.name}" is open; aborting previous action`,
    );
    abortAction({ autoRender: false });
  }
  // When history disabled, set before=null to skip expensive snapshot
  // SAFETY: abortAction checks for null and won't corrupt state
  if (!_historyEnabled) {
    inAction = { name, before: null, meta };
    return;
  }
  inAction = { name, before: snapshot(), meta };
}

function assertPlaySequenceDepthClearForCommit(actionName: string): void {
  const depth = ((state as any).playSequenceDepth ?? 0) as number;
  if (depth === 0) return;
  if (isEffectResolutionPaused()) return;

  const msg =
    `[History] commitAction("${actionName}") with playSequenceDepth=${depth} ` +
    `while effect resolution is not paused`;
  const vitest = readEnv("VITEST");
  const inTest = vitest === "true" || vitest === "1";
  if (isDev() || inTest) {
    throw new Error(msg);
  }
  console.warn(msg);
}

function assertResolutionQueueClearForCommit(actionName: string): void {
  const queueLen = getResolutionQueue().length;
  const draining = !!(state as any)._drainingResolutionQueue;
  if (draining) return;
  if (queueLen === 0) return;
  if (isEffectResolutionPaused()) return;

  const msg =
    `[History] commitAction("${actionName}") with in-flight resolution queue ` +
    `(length=${queueLen}, draining=${draining})`;
  const vitest = readEnv("VITEST");
  const inTest = vitest === "true" || vitest === "1";
  if (isDev() || inTest) {
    throw new Error(msg);
  }
  console.warn(msg);
}

/** Commit the current action (captures after-snapshot; clears redo). */
export function commitAction({ autoRender = true } = {}) {
  if (!inAction) return; // no-op if nothing open

  // When history disabled, just clear inAction without snapshotting
  // Still call notify() for UI consistency (undo/redo button state)
  if (!_historyEnabled || inAction.before === null) {
    inAction = null;
    notify();
    return;
  }

  assertResolutionQueueClearForCommit(inAction.name);
  assertPlaySequenceDepthClearForCommit(inAction.name);
  assertNoDroppedSnapshotStateAtCommit(inAction.name);

  if (_historySuppressRecording) {
    inAction = null;
    notify();
    return;
  }

  bumpActionSeq();
  const after = snapshot();
  const entry: HistoryEntry = { ...inAction, after } as HistoryEntry;
  past.push(entry);
  trimRing();
  future = []; // new branch clears redo
  inAction = null;

  logEvent("history_commit", {
    name: entry.name,
    meta: entry.meta || {},
    before_hash: entry.before_hash,
    after_hash: entry.after_hash,
  });
  emitHistoryEvent({
    type: "commit",
    name: entry.name,
    meta: entry.meta || {},
  });

  const suppress =
    (globalThis as any).HEADLESS === true ||
    (globalThis as any).AI_SUPPRESS_RENDER === true;
  if (autoRender && !suppress) adapter.render();
  notify();
}

/** Abort current action (revert mutations to 'before'). */
export function abortAction({ autoRender = true } = {}) {
  if (!inAction) return;

  // REENTRY SAFETY: Copy before and clear inAction FIRST
  // This prevents errors if adapter.render() calls doAction/beginAction
  const before = inAction.before;
  inAction = null;

  // Revert state if we have a real snapshot (history was enabled)
  if (before !== null) {
    replaceState(cloneSnapshot(before));
    // Respect autoRender and HEADLESS/AI_SUPPRESS_RENDER
    const suppress =
      (globalThis as any).HEADLESS === true ||
      (globalThis as any).AI_SUPPRESS_RENDER === true;
    if (autoRender && !suppress) adapter.render();
  }

  // Always notify for consistency (even if history disabled)
  notify();
}

/** Options for doAction wrapper. */
export interface DoActionOptions {
  autoRender?: boolean;
  /** If true, run invariant checks before/after action */
  checkInvariants?: boolean;
  /** If provided, push replay step with hashes */
  replayLog?: ReplayStep[];
}

/** One-shot helper: wraps a mutation function into a Command. */
export function doAction(
  name: string,
  fn: () => void,
  meta: any = {},
  options: DoActionOptions = {},
) {
  const { autoRender = true, checkInvariants, replayLog } = options;

  // Determine if we should check invariants
  const shouldCheck = checkInvariants ?? !!(globalThis as any).CHECK_INVARIANTS;

  // Pre-action invariant check
  if (shouldCheck) {
    const result = validateGameState(state);
    if (!result.valid) {
      throw new Error(`Invariant BEFORE ${name}: ${result.issues.join(", ")}`);
    }
  }

  // Hash before (for replay verification)
  const hashBefore = replayLog ? hashGameState(state) : undefined;

  beginAction(name, meta);
  try {
    fn(); // perform all state mutations here
    commitAction({ autoRender });

    // Hash after and log (for replay verification)
    if (replayLog && hashBefore !== undefined) {
      const hashAfter = hashGameState(state);
      replayLog.push({
        actionType: name,
        stateHashBefore: hashBefore,
        stateHashAfter: hashAfter,
      });
    }
  } catch (e) {
    abortAction({ autoRender });
    throw e;
  }

  // Post-action invariant check
  if (shouldCheck) {
    const result = validateGameState(state);
    if (!result.valid) {
      throw new Error(`Invariant AFTER ${name}: ${result.issues.join(", ")}`);
    }
  }
}

/** True if an action is currently open. */
export function isInAction() {
  return !!inAction;
}

/**
 * Append a non-snapshot "step" into the current open action.
 * Useful to record sub-decisions (e.g., AI choose picks) without nesting actions.
 */
export function appendStep(name: string, meta: any = {}) {
  if (!inAction) {
    logEvent("history_step", { parent: null, step: name, meta });
    return;
  }
  if (!inAction.meta) inAction.meta = {};
  if (!Array.isArray(inAction.meta.steps)) inAction.meta.steps = [];
  const step = { ts: Date.now(), name, meta };
  inAction.meta.steps.push(step);
  logEvent("history_step", { parent: inAction.name, step: name, meta });
}

/** Undo last action. */
export function undo({ autoRender = true } = {}) {
  if (isInAction()) return false;
  if (past.length === 0) return false;
  const entry = past.pop();
  if (entry) {
    future.push(entry);
    replaceState(cloneSnapshot(entry.before));
    logEvent("history_undo", { name: entry.name, meta: entry.meta || {} });
    emitHistoryEvent({
      type: "undo",
      name: entry.name,
      meta: entry.meta || {},
    });
    resyncInteractivePromptsAfterHistoryRestore();
    if (autoRender) adapter.render();
    notify();
    return true;
  }
  return false;
}

/** Redo last undone action. */
export function redo({ autoRender = true } = {}) {
  if (isInAction()) return false;
  if (future.length === 0) return false;
  const entry = future.pop();
  if (entry) {
    past.push(entry);
    if (entry.after) replaceState(cloneSnapshot(entry.after));
    logEvent("history_redo", { name: entry.name, meta: entry.meta || {} });
    emitHistoryEvent({
      type: "redo",
      name: entry.name,
      meta: entry.meta || {},
    });
    resyncInteractivePromptsAfterHistoryRestore();
    if (autoRender) adapter.render();
    notify();
    return true;
  }
  return false;
}

export function canUndo() {
  return past.length > 0;
}
export function canRedo() {
  return future.length > 0;
}

/**
 * Move undone commits from future → past without restoring snapshots.
 * Used when live state was already brought to `after` by re-executing actions.
 */
export function acceptUndoneCommits(commits: number): void {
  for (let i = 0; i < commits; i++) {
    const entry = future.pop();
    if (!entry) break;
    past.push(entry);
  }
  notify();
}

/** Optional: set a listener to enable/disable UI buttons. */
export function onHistoryChange(
  cb: (status: { canUndo: boolean; canRedo: boolean }) => void,
) {
  onChange = cb;
  notify();
}

/** Optional: clear all history (e.g., on New Game). */
export function resetHistory() {
  past = [];
  future = [];
  inAction = null;
  emitHistoryEvent({ type: "reset" });
  notify();
}

/** Hotkeys: Ctrl/Cmd+Z (undo), Ctrl+Shift+Z or Ctrl+Y (redo) */
export function initHistoryHotkeys({
  target = document,
}: { target?: Document | HTMLElement } = {}) {
  target.addEventListener("keydown", (e: any) => {
    const el = e.target as HTMLElement | null | undefined;
    if (el) {
      const tag = (el.tagName || "").toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el as any).isContentEditable
      ) {
        return;
      }
    }

    const isMac =
      typeof navigator !== "undefined" &&
      navigator.platform &&
      navigator.platform.toUpperCase().includes("MAC");
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    // Undo: Ctrl/Cmd+Z (without Shift)
    if (ctrl && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
      return;
    }
    // Redo: Ctrl/Cmd+Shift+Z OR Ctrl+Y
    if (
      (ctrl && e.shiftKey && (e.key === "z" || e.key === "Z")) ||
      (e.ctrlKey && (e.key === "y" || e.key === "Y"))
    ) {
      e.preventDefault();
      redo();
    }
  });
}
