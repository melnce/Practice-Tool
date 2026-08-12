/**
 * Sparring-line runtime: record a side's actions, or play a loaded line.
 *
 * Divergence policy: HALT loudly. Quietly skipping or nearest-matching would
 * teach a line that never happened.
 */

import { state } from "../../core/gameState.js";
import { onHistoryEvent } from "../../core/history.js";
import type { Player, PlayerAction } from "../../core/types/index.js";
import { occurrenceOf } from "../../core/script/identity.js";
import {
  SCRIPT_SCHEMA_VERSION,
  type ScriptDocument,
  type ScriptProgress,
  type ScriptStep,
  ScriptDivergeError,
} from "../../core/script/types.js";
import { getHand, getBoard, opponentOf } from "../../core/playerHelpers.js";
import { dispatchAction } from "../core/dispatch.js";
import { scriptStepToAction } from "./resolve.js";
import {
  setScriptedModePickProvider,
  setScriptedModeRecordSink,
} from "./modeHook.js";

export type ScriptRuntimeListener = () => void;

type Mode = "idle" | "recording" | "playing";

type HistorySnap = { cursor: number; stepsLen: number };

let mode: Mode = "idle";
let doc: ScriptDocument | null = null;
let cursor = 0;
let diverged = false;
let divergeReason: string | null = null;
let hiddenHand = false;
let historyUnsub: (() => void) | null = null;
const pastSnaps: HistorySnap[] = [];
const futureSnaps: HistorySnap[] = [];
/** Mode steps consumed mid-play (indices into doc.steps). */
const consumedModeSteps = new Set<number>();
const listeners = new Set<ScriptRuntimeListener>();

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.error("[Script] listener error", e);
    }
  }
}

function currentSnap(): HistorySnap {
  return { cursor, stepsLen: doc?.steps.length ?? 0 };
}

function touchLastSnap(): void {
  if (pastSnaps.length > 0) {
    pastSnaps[pastSnaps.length - 1] = currentSnap();
  }
}

function restoreFromSnaps(): void {
  const cur = pastSnaps[pastSnaps.length - 1];
  if (mode === "playing") {
    cursor = cur?.cursor ?? 0;
    diverged = false;
    divergeReason = null;
    // Rebuild consumed set: any CHOOSE_MODE strictly before cursor may have run.
    consumedModeSteps.clear();
    if (doc) {
      for (let i = 0; i < cursor; i++) {
        if (doc.steps[i]?.op === "CHOOSE_MODE") consumedModeSteps.add(i);
      }
    }
  } else if (mode === "recording" && doc) {
    doc.steps.length = cur?.stepsLen ?? 0;
  }
}

export function onScriptRuntimeChange(cb: ScriptRuntimeListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isHiddenHandEnabled(): boolean {
  return hiddenHand;
}

export function setHiddenHandEnabled(on: boolean): void {
  hiddenHand = !!on;
  notify();
}

export function getScriptRuntimeSnapshot(): {
  mode: Mode;
  doc: ScriptDocument | null;
  progress: ScriptProgress | null;
  hiddenHand: boolean;
} {
  return {
    mode,
    doc,
    progress: doc
      ? (() => {
          const p: ScriptProgress = {
            schemaVersion: SCRIPT_SCHEMA_VERSION,
            name: doc.name,
            scriptedSide: doc.scriptedSide,
            cursor,
            diverged,
          };
          if (divergeReason) p.divergeReason = divergeReason;
          return p;
        })()
      : null,
    hiddenHand,
  };
}

function ensureHistoryHook(): void {
  if (historyUnsub) return;
  historyUnsub = onHistoryEvent((ev) => {
    if (mode === "idle" || !doc) return;
    if (ev.type === "reset") {
      pastSnaps.length = 0;
      futureSnaps.length = 0;
      consumedModeSteps.clear();
      return;
    }
    if (ev.type === "commit") {
      pastSnaps.push(currentSnap());
      futureSnaps.length = 0;
      return;
    }
    if (ev.type === "undo") {
      const removed = pastSnaps.pop();
      if (removed) futureSnaps.push(removed);
      restoreFromSnaps();
      notify();
      return;
    }
    if (ev.type === "redo") {
      const restored = futureSnaps.pop();
      if (restored) {
        pastSnaps.push(restored);
        if (mode === "playing") {
          cursor = restored.cursor;
        } else if (mode === "recording" && doc) {
          // Redo restores game state via history; steps array is not replayed.
          // Keep stepsLen snap in sync with whatever was recorded.
        }
      }
      notify();
    }
  });
}

/** Clear loaded line / stop recording. */
export function clearScript(): void {
  mode = "idle";
  doc = null;
  cursor = 0;
  diverged = false;
  divergeReason = null;
  pastSnaps.length = 0;
  futureSnaps.length = 0;
  consumedModeSteps.clear();
  setScriptedModePickProvider(null);
  setScriptedModeRecordSink(null);
  notify();
}

export function startRecording(opts: {
  name: string;
  scriptedSide: Player;
  seed?: number | string;
  deckAId?: string;
  deckBId?: string;
}): void {
  ensureHistoryHook();
  mode = "recording";
  cursor = 0;
  diverged = false;
  divergeReason = null;
  pastSnaps.length = 0;
  futureSnaps.length = 0;
  consumedModeSteps.clear();
  doc = {
    schemaVersion: SCRIPT_SCHEMA_VERSION,
    name: opts.name,
    scriptedSide: opts.scriptedSide,
    steps: [],
  };
  if (opts.seed !== undefined) doc.seed = opts.seed;
  if (opts.deckAId) doc.deckAId = opts.deckAId;
  if (opts.deckBId) doc.deckBId = opts.deckBId;

  setScriptedModeRecordSink((owner, indices) => {
    if (mode !== "recording" || !doc) return;
    if (owner !== doc.scriptedSide) return;
    doc.steps.push({ op: "CHOOSE_MODE", indices: indices.slice() });
    touchLastSnap();
    notify();
  });
  setScriptedModePickProvider(null);
  notify();
}

export function stopRecording(): ScriptDocument | null {
  if (mode !== "recording") return doc;
  // Keep `doc` so Export still works; leave mode idle.
  mode = "idle";
  setScriptedModeRecordSink(null);
  notify();
  return doc;
}

export function loadScriptForPlayback(script: ScriptDocument): void {
  ensureHistoryHook();
  mode = "playing";
  doc = {
    ...script,
    steps: script.steps.map((s) => structuredClone(s)),
  };
  cursor = 0;
  diverged = false;
  divergeReason = null;
  pastSnaps.length = 0;
  futureSnaps.length = 0;
  consumedModeSteps.clear();
  setScriptedModeRecordSink(null);
  installPlaybackModeProvider();
  notify();
}

function installPlaybackModeProvider(): void {
  setScriptedModePickProvider((req) => {
    if (mode !== "playing" || !doc || diverged) return null;
    if (req.owner !== doc.scriptedSide) return null;
    // Mode fires mid-action while `cursor` still points at PLAY/EVOLVE/ENGAGE.
    // The matching CHOOSE_MODE must be the immediately following step.
    const modeIdx = cursor + 1;
    const step = doc.steps[modeIdx];
    if (!step || step.op !== "CHOOSE_MODE") {
      haltDiverge(
        modeIdx,
        step ?? null,
        `Expected CHOOSE_MODE after step ${cursor}; got ${step ? step.op : "end of script"}`,
      );
      return null;
    }
    consumedModeSteps.add(modeIdx);
    touchLastSnap();
    notify();
    return step.indices.slice();
  });
}

function haltDiverge(
  stepIndex: number,
  step: ScriptStep | null,
  reason: string,
): void {
  diverged = true;
  divergeReason = `Script diverged at step ${stepIndex}: ${reason}`;
  console.warn(`[Script] ${divergeReason}`, step);
  notify();
}

/**
 * Record a step computed against zones *before* the mutation (PLAY_CARD etc.).
 */
export function recordScriptStep(step: ScriptStep | null): void {
  if (mode !== "recording" || !doc) return;
  if (!step) return;
  doc.steps.push(step);
  touchLastSnap();
  notify();
}

export function buildRecordStepFromAction(
  action: PlayerAction,
  zones?: {
    hand?: ReturnType<typeof getHand>;
    board?: ReturnType<typeof getBoard>;
    enemyBoard?: ReturnType<typeof getBoard>;
  },
): ScriptStep | null {
  if (mode !== "recording" || !doc) return null;
  const side = doc.scriptedSide;
  switch (action.type) {
    case "END_TURN":
      return { op: "END_TURN" };
    case "PLAY_CARD": {
      if (action.player !== side) return null;
      const zone = zones?.hand ?? getHand(state, side);
      const ref = occurrenceOf(zone, action.cardUid);
      if (!ref) return null;
      return { op: "PLAY_CARD", card: ref };
    }
    case "ATTACK": {
      if (action.player !== side) return null;
      const board = zones?.board ?? getBoard(state, side);
      const atk = occurrenceOf(board, action.attackerUid);
      if (!atk) return null;
      if (action.defender.type === "leader") {
        return { op: "ATTACK", attacker: atk, defender: { kind: "leader" } };
      }
      const enemy = zones?.enemyBoard ?? getBoard(state, opponentOf(side));
      const def = occurrenceOf(enemy, action.defender.uid);
      if (!def) return null;
      return { op: "ATTACK", attacker: atk, defender: def };
    }
    case "EVOLVE": {
      if (action.player !== side) return null;
      const board = zones?.board ?? getBoard(state, side);
      const ref = occurrenceOf(board, action.cardUid);
      if (!ref) return null;
      return { op: "EVOLVE", card: ref, mode: action.mode };
    }
    case "ENGAGE": {
      if (action.player !== side) return null;
      const board = zones?.board ?? getBoard(state, side);
      const ref = occurrenceOf(board, action.cardUid);
      if (!ref) return null;
      return { op: "ENGAGE", card: ref };
    }
    case "BONUS_PP":
      if (action.player !== side) return null;
      return { op: "BONUS_PP" };
    case "CHOOSE_TARGET": {
      if (action.player !== side) return null;
      if (action.target.type === "leader") {
        return { op: "CHOOSE_TARGET", target: { kind: "leader" } };
      }
      const enemy = zones?.enemyBoard ?? getBoard(state, opponentOf(side));
      const enemyRef = occurrenceOf(enemy, action.target.uid);
      if (enemyRef) return { op: "CHOOSE_TARGET", target: enemyRef };
      const board = zones?.board ?? getBoard(state, side);
      const ally = occurrenceOf(board, action.target.uid);
      if (ally) return { op: "CHOOSE_TARGET", target: ally };
      return null;
    }
    case "TOGGLE_MULLIGAN": {
      if (action.player !== side) return null;
      const zone = zones?.hand ?? getHand(state, side);
      const ref = occurrenceOf(zone, action.cardUid);
      if (!ref) return null;
      return { op: "TOGGLE_MULLIGAN", card: ref };
    }
    case "CONFIRM_MULLIGAN":
      if (action.player !== side) return null;
      return { op: "CONFIRM_MULLIGAN" };
    default:
      return null;
  }
}

/**
 * Apply the next script step(s) for the scripted side until END_TURN,
 * divergence, or end of script.
 */
export function advanceScriptPlayback(opts?: {
  applyAction?: (action: PlayerAction) => void;
}): { applied: number; status: "ok" | "diverged" | "done" | "waiting" } {
  if (mode !== "playing" || !doc) return { applied: 0, status: "done" };
  if (diverged) return { applied: 0, status: "diverged" };

  const apply =
    opts?.applyAction ??
    ((action: PlayerAction) => {
      dispatchAction(state, action);
    });

  let applied = 0;
  while (cursor < doc.steps.length) {
    if (consumedModeSteps.has(cursor)) {
      cursor += 1;
      touchLastSnap();
      continue;
    }

    const step = doc.steps[cursor]!;
    if (step.op === "CHOOSE_MODE") {
      haltDiverge(
        cursor,
        step,
        "CHOOSE_MODE with no pending mode effect (out of order)",
      );
      return { applied, status: "diverged" };
    }

    if (
      state.pendingTargetEffect &&
      state.pendingTargetEffect.owner === doc.scriptedSide &&
      step.op !== "CHOOSE_TARGET"
    ) {
      haltDiverge(
        cursor,
        step,
        `pending target requires CHOOSE_TARGET, got ${step.op}`,
      );
      return { applied, status: "diverged" };
    }

    try {
      const action = scriptStepToAction(state, doc.scriptedSide, step, cursor);
      apply(action);
      cursor += 1;
      // Skip a CHOOSE_MODE that was consumed during this action.
      while (consumedModeSteps.has(cursor)) cursor += 1;
      touchLastSnap();
      applied += 1;
      notify();

      if (step.op === "END_TURN") {
        return { applied, status: "ok" };
      }

      if (
        state.pendingTargetEffect &&
        state.pendingTargetEffect.owner === doc.scriptedSide
      ) {
        const next = doc.steps[cursor];
        if (next?.op === "CHOOSE_TARGET") continue;
        haltDiverge(
          cursor,
          next ?? null,
          "pending target but next script step is not CHOOSE_TARGET",
        );
        return { applied, status: "diverged" };
      }
    } catch (e) {
      if (e instanceof ScriptDivergeError) {
        haltDiverge(e.stepIndex, e.step, e.message);
        return { applied, status: "diverged" };
      }
      haltDiverge(cursor, step, e instanceof Error ? e.message : String(e));
      return { applied, status: "diverged" };
    }
  }

  return { applied, status: "done" };
}

/** Whether the active player is the scripted side under playback. */
export function shouldAutoAdvanceScript(): boolean {
  if (mode !== "playing" || !doc || diverged) return false;
  if (state.phase === "gameover") return false;
  if (state.phase === "mulligan") {
    return state.mulliganStage === doc.scriptedSide;
  }
  return state.activePlayer === doc.scriptedSide;
}

export function getRecordingDocument(): ScriptDocument | null {
  return doc;
}

export function restoreScriptProgress(progress: ScriptProgress): void {
  if (!doc) return;
  if (progress.name !== doc.name) return;
  cursor = Math.max(0, Math.min(progress.cursor, doc.steps.length));
  diverged = !!progress.diverged;
  divergeReason = progress.divergeReason ?? null;
  consumedModeSteps.clear();
  for (let i = 0; i < cursor; i++) {
    if (doc.steps[i]?.op === "CHOOSE_MODE") consumedModeSteps.add(i);
  }
  notify();
}

export function isScriptPlaybackActive(): boolean {
  return mode === "playing" && !!doc && !diverged;
}

export function isScriptRecordingActive(): boolean {
  return mode === "recording" && !!doc;
}

export function getScriptedSide(): Player | null {
  return doc?.scriptedSide ?? null;
}
