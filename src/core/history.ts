// /gamelogic/history.ts
import { state } from "./gameState.js";
import { render } from "../ui/render.js";
import { logEvent } from "./logger.js";
import { getRngSnapshot, setRngSnapshot } from "./rng.js";
import { GameState } from "./types.js";

// --- Config ---
const MAX_HISTORY = 200; // ring limit

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
  before: GameState;
  meta: any;
}

// --- Internals ---
let past: HistoryEntry[] = [];   // stack of { name, before, after, meta }
let future: HistoryEntry[] = []; // stack of same
let inAction: ActionContext | null = null; // { name, before, meta }
let onChange: ((status: { canUndo: boolean, canRedo: boolean }) => void) | null = null; // optional listener

// Shallow hash already exists in your logger; if you have a fast state hash, reuse it.
function snapshot(): GameState {
  const snap = structuredClone(state) as GameState;
  // persist RNG position alongside state
  (snap as any).__rng = getRngSnapshot();
  return snap;
}

function replaceState(next: GameState) {
  // Replace all top-level keys to keep references stable where possible
  // (prevents modules holding "state" reference from becoming stale).
  for (const k of Object.keys(state)) delete state[k];
  for (const [k, v] of Object.entries(next)) state[k] = v;

  // restore RNG after state rehydrate
  if (next && (next as any).__rng) setRngSnapshot((next as any).__rng);
}

function trimRing() {
  if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY);
}

function notify() { if (typeof onChange === "function") onChange({ canUndo: past.length > 0, canRedo: future.length > 0 }); }

// --- Public API ---

/** Begin an action. Wrap mutations between beginAction/commitAction OR use doAction(). */
export function beginAction(name: string, meta: any = {}) {
  if (inAction) throw new Error("history.beginAction called while another action is open");
  inAction = { name, before: snapshot(), meta };
}

/** Commit the current action (captures after-snapshot; clears redo). */
export function commitAction({ autoRender = true } = {}) {
  if (!inAction) return; // no-op if nothing open
  const after = snapshot();
  const entry: HistoryEntry = { ...inAction, after };
  past.push(entry);
  trimRing();
  future = []; // new branch clears redo
  inAction = null;

  logEvent("history_commit", {
    name: entry.name,
    meta: entry.meta || {},
    before_hash: entry.before_hash, // optional if you store it
    after_hash: entry.after_hash
  });

  const suppress = ((globalThis as any).HEADLESS === true) || ((globalThis as any).AI_SUPPRESS_RENDER === true);
  if (autoRender && !suppress) render();
  notify();
}

/** Abort current action (revert mutations to 'before'). */
export function abortAction() {
  if (!inAction) return;
  replaceState(inAction.before);
  inAction = null;
  render();
  notify();
}

/** One-shot helper: wraps a mutation function into a Command. */
export function doAction(name: string, fn: () => void, meta: any = {}, { autoRender = true } = {}) {
  beginAction(name, meta);
  try {
    fn(); // perform all state mutations here
    commitAction({ autoRender });
  } catch (e) {
    abortAction();
    throw e;
  }
}

/** True if an action is currently open. */
export function isInAction() { return !!inAction; }

/**
 * Append a non-snapshot "step" into the current open action.
 * Useful to record sub-decisions (e.g., AI choose picks) without nesting actions.
 */
export function appendStep(name: string, meta: any = {}) {
  if (!inAction) {
    // No action open → record a zero-mutation action so the step is still visible in history.
    doAction(name, () => { }, { step: true, ...meta }, { autoRender: false });
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
  if (past.length === 0) return false;
  const entry = past.pop();
  if (entry) {
    future.push(entry);
    replaceState(entry.before);
    logEvent("history_undo", { name: entry.name, meta: entry.meta || {} });
    if (autoRender) render();
    notify();
    return true;
  }
  return false;
}

/** Redo last undone action. */
export function redo({ autoRender = true } = {}) {
  if (future.length === 0) return false;
  const entry = future.pop();
  if (entry) {
    past.push(entry);
    if (entry.after) replaceState(entry.after);
    logEvent("history_redo", { name: entry.name, meta: entry.meta || {} });
    if (autoRender) render();
    notify();
    return true;
  }
  return false;
}

export function canUndo() { return past.length > 0; }
export function canRedo() { return future.length > 0; }

/** Optional: set a listener to enable/disable UI buttons. */
export function onHistoryChange(cb: (status: { canUndo: boolean, canRedo: boolean }) => void) { onChange = cb; notify(); }

/** Optional: clear all history (e.g., on New Game). */
export function resetHistory() {
  past = [];
  future = [];
  inAction = null;
  notify();
}

/** Hotkeys: Ctrl/Cmd+Z (undo), Ctrl+Shift+Z or Ctrl+Y (redo) */
export function initHistoryHotkeys({ target = document }: { target?: Document | HTMLElement } = {}) {
  target.addEventListener("keydown", (e: any) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    // Undo: Ctrl/Cmd+Z (without Shift)
    if (ctrl && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
      return;
    }
    // Redo: Ctrl/Cmd+Shift+Z OR Ctrl+Y
    if ((ctrl && e.shiftKey && (e.key === "z" || e.key === "Z")) ||
      (e.ctrlKey && (e.key === "y" || e.key === "Y"))) {
      e.preventDefault();
      redo();
    }
  });
}
