/**
 * @file Save/Load positions + Checkpoint/Reroll for solo drilling.
 *
 * Storage: in-memory for the session. Durable sharing is JSON file export/import.
 * localStorage is only used elsewhere for a UI preference and is unreliable in this
 * environment — positions intentionally do NOT use it.
 *
 * Reroll seed derivation:
 *   subSeed = mix32(originalSeed, checkpointCursor, rerollIndex)
 * where mix32 is a small integer mixer. The Nth reroll of a checkpoint is always
 * identical because it depends only on those three values.
 *
 * Already-shuffled deck trap:
 *   Opening shuffle freezes deck order in state. Restoring RNG alone cannot change
 *   future draws (deck.pop). After restoring the checkpoint board/hand/zones, we
 *   re-seed the RNG onto the derived branch and shuffleInPlace each player's
 *   remaining deck. Cards already in hand/board/graveyard/banish are untouched.
 */

import { state } from "./gameState.js";
import {
  applySnapshot,
  captureSnapshot,
  doAction,
  resetHistory,
} from "./history.js";
import { shuffleInPlace } from "./utils.js";
import type { GameState, PlayerSlot } from "./types/index.js";
import { adapter } from "./adapter.js";
import { logEvent } from "./logger.js";

/** Bump when the on-disk/export JSON shape changes incompatibly. */
export const POSITION_SCHEMA_VERSION = 1;

export interface PositionMeta {
  deckAId?: string;
  deckBId?: string;
  turnNumber: number;
  roundCount: number;
  seed: number;
  activePlayer: PlayerSlot;
  phase?: string | null;
  /**
   * Optional sparring-line cursor when a script is loaded.
   * TODO(scripted-opponent): full round-trip of the script body inside a
   * position export is larger than this PR needs — we store progress only;
   * the line JSON must still be loaded separately before Load Pos.
   */
  scriptProgress?: {
    schemaVersion: number;
    name: string;
    scriptedSide: PlayerSlot;
    cursor: number;
    diverged?: boolean;
    divergeReason?: string;
  };
}

export interface SavedPosition {
  schemaVersion: number;
  id: string;
  name: string;
  /** Metadata only — Date.now() must never drive gameplay. */
  savedAt: number;
  meta: PositionMeta;
  /** History-style snapshot with `__rng` (no live RNG methods). */
  state: GameState;
}

export interface CheckpointInfo {
  active: boolean;
  rerollCount: number;
  originalSeed: number | null;
  checkpointCursor: number | null;
  setAtTurn: number | null;
  setAtRound: number | null;
}

export class PositionSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositionSchemaError";
  }
}

// --- Session deck/seed labels (for save metadata; not gameplay) ---------------

let sessionDeckAId: string | undefined;
let sessionDeckBId: string | undefined;

/** Record which decks were used for the current game (call from boot/start). */
export function setSessionDeckIds(deckAId: string, deckBId: string): void {
  sessionDeckAId = deckAId;
  sessionDeckBId = deckBId;
}

export function getSessionDeckIds(): {
  deckAId?: string;
  deckBId?: string;
} {
  const out: { deckAId?: string; deckBId?: string } = {};
  if (sessionDeckAId !== undefined) out.deckAId = sessionDeckAId;
  if (sessionDeckBId !== undefined) out.deckBId = sessionDeckBId;
  return out;
}

// --- In-memory position library ----------------------------------------------

const positions = new Map<string, SavedPosition>();
let positionSeq = 0;

type PositionChangeListener = () => void;
let onPositionsChange: PositionChangeListener | null = null;
let onCheckpointChange: PositionChangeListener | null = null;

export function onPositionLibraryChange(
  cb: PositionChangeListener | null,
): void {
  onPositionsChange = cb;
}

export function onCheckpointInfoChange(
  cb: PositionChangeListener | null,
): void {
  onCheckpointChange = cb;
}

function notifyPositions(): void {
  onPositionsChange?.();
}

function notifyCheckpoint(): void {
  onCheckpointChange?.();
}

function buildMeta(extra?: Partial<PositionMeta>): PositionMeta {
  const rngSnap = state.rng.snapshot();
  const meta: PositionMeta = {
    turnNumber: extra?.turnNumber ?? state.turnNumber ?? 0,
    roundCount: extra?.roundCount ?? state.roundCount ?? 1,
    seed: extra?.seed ?? rngSnap.seed,
    activePlayer: extra?.activePlayer ?? state.activePlayer,
    phase: extra?.phase !== undefined ? extra.phase : (state.phase ?? null),
  };
  const deckA = extra?.deckAId ?? sessionDeckAId;
  const deckB = extra?.deckBId ?? sessionDeckBId;
  if (deckA !== undefined) meta.deckAId = deckA;
  if (deckB !== undefined) meta.deckBId = deckB;
  return meta;
}

function newPositionId(): string {
  positionSeq += 1;
  return `pos_${positionSeq.toString(36)}_${(state.rng.snapshot().seed >>> 0).toString(16)}`;
}

/** Save the current game state under a name. Returns the saved record. */
export function savePosition(
  name: string,
  opts?: { meta?: Partial<PositionMeta>; id?: string },
): SavedPosition {
  const trimmed = (name || "").trim() || "Untitled position";
  const id = opts?.id ?? newPositionId();
  const record: SavedPosition = {
    schemaVersion: POSITION_SCHEMA_VERSION,
    id,
    name: trimmed,
    savedAt: Date.now(),
    meta: buildMeta(opts?.meta),
    state: captureSnapshot(),
  };
  positions.set(id, record);
  logEvent("position_save", {
    id,
    name: trimmed,
    turn: record.meta.turnNumber,
    seed: record.meta.seed,
  });
  notifyPositions();
  return record;
}

export function listPositions(): SavedPosition[] {
  return [...positions.values()].sort((a, b) => b.savedAt - a.savedAt);
}

export function getPosition(id: string): SavedPosition | undefined {
  return positions.get(id);
}

export function renamePosition(id: string, name: string): SavedPosition {
  const existing = positions.get(id);
  if (!existing) {
    throw new Error(`No saved position with id "${id}"`);
  }
  const trimmed = (name || "").trim();
  if (!trimmed) {
    throw new Error("Position name must not be empty");
  }
  existing.name = trimmed;
  notifyPositions();
  return existing;
}

export function deletePosition(id: string): boolean {
  const ok = positions.delete(id);
  if (ok) notifyPositions();
  return ok;
}

/** Load a saved position into live state and reset undo history to that floor. */
export function loadPosition(
  id: string,
  opts?: { autoRender?: boolean },
): SavedPosition {
  const existing = positions.get(id);
  if (!existing) {
    throw new Error(`No saved position with id "${id}"`);
  }
  applySnapshot(existing.state, {
    autoRender: opts?.autoRender ?? true,
    resetHistory: true,
  });
  logEvent("position_load", {
    id,
    name: existing.name,
    turn: existing.meta.turnNumber,
  });
  return existing;
}

// --- JSON export / import ----------------------------------------------------

const SET_TAG = "__svwb_set__";

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return { [SET_TAG]: true, values: [...value] };
  }
  return value;
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    (value as any)[SET_TAG] === true &&
    Array.isArray((value as any).values)
  ) {
    return new Set((value as any).values);
  }
  return value;
}

/** Serialize a saved position to a stable JSON string (pretty-printed). */
export function exportPositionToJson(id: string): string {
  const existing = positions.get(id);
  if (!existing) {
    throw new Error(`No saved position with id "${id}"`);
  }
  return JSON.stringify(existing, jsonReplacer, 2);
}

export function exportPositionRecordToJson(record: SavedPosition): string {
  return JSON.stringify(record, jsonReplacer, 2);
}

/**
 * Parse a position JSON string. Fails loudly on version mismatch — does not
 * mutate the live game or the in-memory library.
 */
export function parsePositionJson(json: string): SavedPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json, jsonReviver);
  } catch (e) {
    throw new PositionSchemaError(
      `Invalid position JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PositionSchemaError("Position JSON must be an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== POSITION_SCHEMA_VERSION) {
    throw new PositionSchemaError(
      `Unsupported position schema version: ${String(obj.schemaVersion)} (expected ${POSITION_SCHEMA_VERSION})`,
    );
  }
  if (typeof obj.id !== "string" || typeof obj.name !== "string") {
    throw new PositionSchemaError("Position JSON missing id/name");
  }
  if (!obj.state || typeof obj.state !== "object") {
    throw new PositionSchemaError("Position JSON missing state");
  }
  if (!(obj.state as any).__rng) {
    throw new PositionSchemaError("Position JSON missing state.__rng");
  }
  if (!obj.meta || typeof obj.meta !== "object") {
    throw new PositionSchemaError("Position JSON missing meta");
  }
  return obj as unknown as SavedPosition;
}

/**
 * Import a position from JSON into the in-memory library.
 * Does not load it into the live game unless `load` is true.
 */
export function importPositionFromJson(
  json: string,
  opts?: { load?: boolean; autoRender?: boolean },
): SavedPosition {
  const record = parsePositionJson(json);
  // Re-key if id collides so import never silently overwrites.
  if (positions.has(record.id)) {
    record.id = newPositionId();
  }
  positions.set(record.id, record);
  notifyPositions();
  logEvent("position_import", { id: record.id, name: record.name });
  if (opts?.load) {
    applySnapshot(record.state, {
      autoRender: opts.autoRender ?? true,
      resetHistory: true,
    });
  }
  return record;
}

/** Download helper for the UI (Blob + anchor click). */
export function downloadPositionJson(id: string, filename?: string): void {
  if (typeof document === "undefined") return;
  const json = exportPositionToJson(id);
  const record = positions.get(id)!;
  const safeName = (filename || record.name || "position")
    .replace(/[^\w-]+/g, "_")
    .slice(0, 64);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.svwb-position.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

// --- Checkpoint + Reroll -----------------------------------------------------

interface CheckpointRecord {
  snapshot: GameState;
  originalSeed: number;
  checkpointCursor: number;
  uidCounter: number;
  rerollCount: number;
  setAtTurn: number;
  setAtRound: number;
}

let checkpoint: CheckpointRecord | null = null;

/**
 * Mix (originalSeed, checkpointCursor, rerollIndex) into a uint32 sub-seed.
 * Pure function — same inputs always yield the same branch.
 */
export function deriveRerollSeed(
  originalSeed: number,
  checkpointCursor: number,
  rerollIndex: number,
): number {
  // SplitMix32-style avalanche over the three fields.
  let h = (originalSeed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= (checkpointCursor >>> 0) + 0x7f4a7c15;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= (rerollIndex >>> 0) * 0x27d4eb2d;
  h = Math.imul(h ^ (h >>> 16), 0x165667b1);
  h ^= h >>> 15;
  return h >>> 0;
}

export function getCheckpointInfo(): CheckpointInfo {
  if (!checkpoint) {
    return {
      active: false,
      rerollCount: 0,
      originalSeed: null,
      checkpointCursor: null,
      setAtTurn: null,
      setAtRound: null,
    };
  }
  return {
    active: true,
    rerollCount: checkpoint.rerollCount,
    originalSeed: checkpoint.originalSeed,
    checkpointCursor: checkpoint.checkpointCursor,
    setAtTurn: checkpoint.setAtTurn,
    setAtRound: checkpoint.setAtRound,
  };
}

/** Mark the current position as the drilling checkpoint (exact RNG included). */
export function setCheckpoint(): CheckpointInfo {
  const snap = captureSnapshot();
  const rngMeta = (snap as any).__rng as {
    seed: number;
    cursor: number;
    uidCounter: number;
  };
  if (!rngMeta) {
    throw new Error("Cannot set checkpoint: missing RNG snapshot");
  }
  checkpoint = {
    snapshot: snap,
    originalSeed: rngMeta.seed,
    checkpointCursor: rngMeta.cursor,
    uidCounter: rngMeta.uidCounter,
    rerollCount: 0,
    setAtTurn: state.turnNumber ?? 0,
    setAtRound: state.roundCount ?? 1,
  };
  logEvent("checkpoint_set", {
    seed: rngMeta.seed,
    cursor: rngMeta.cursor,
    turn: checkpoint.setAtTurn,
  });
  notifyCheckpoint();
  return getCheckpointInfo();
}

export function clearCheckpoint(): void {
  checkpoint = null;
  notifyCheckpoint();
}

/** Restore the checkpoint exactly (same RNG branch). Resets undo floor. */
export function restoreCheckpoint(opts?: { autoRender?: boolean }): boolean {
  if (!checkpoint) return false;
  applySnapshot(checkpoint.snapshot, {
    autoRender: opts?.autoRender ?? true,
    resetHistory: true,
  });
  // Exact restore — leave rerollCount as a "how deep you went" indicator.
  logEvent("checkpoint_restore", {
    seed: checkpoint.originalSeed,
    cursor: checkpoint.checkpointCursor,
    rerollCount: checkpoint.rerollCount,
  });
  notifyCheckpoint();
  return true;
}

/**
 * Apply a specific reroll index (1-based). Restores board/hand/zones from the
 * checkpoint, branches RNG, and re-shuffles remaining decks only.
 */
export function applyRerollBranch(
  rerollIndex: number,
  opts?: { autoRender?: boolean },
): CheckpointInfo {
  if (!checkpoint) {
    throw new Error("No checkpoint set — cannot reroll");
  }
  if (!Number.isFinite(rerollIndex) || rerollIndex < 1) {
    throw new Error(`rerollIndex must be >= 1 (got ${rerollIndex})`);
  }

  const cp = checkpoint;
  const subSeed = deriveRerollSeed(
    cp.originalSeed,
    cp.checkpointCursor,
    rerollIndex,
  );

  // Restore zones/board/hand from checkpoint (clone inside applySnapshot).
  // We'll re-branch RNG and reshuffle inside doAction so undo of post-reroll
  // play still works; the reroll itself becomes the new history floor.
  applySnapshot(cp.snapshot, { autoRender: false, resetHistory: true });

  doAction(
    "Checkpoint Reroll",
    () => {
      // Fresh branch: new seed at cursor 0, preserve uidCounter so existing
      // card UIDs stay unique against future summons.
      state.rng.restore({
        seed: subSeed,
        cursor: 0,
        uidCounter: cp.uidCounter,
      });
      // Re-randomise only undrawn remainder — known cards stay identical.
      shuffleInPlace(state.players.first.deck);
      shuffleInPlace(state.players.second.deck);
    },
    { rerollIndex, subSeed },
    { autoRender: false },
  );

  // Reroll is the new floor — don't let undo walk back into the pre-shuffle
  // identical checkpoint (that would look like a no-op undo).
  resetHistory();

  cp.rerollCount = rerollIndex;
  logEvent("checkpoint_reroll", {
    rerollIndex,
    subSeed,
    originalSeed: cp.originalSeed,
    cursor: cp.checkpointCursor,
  });

  const suppress =
    (globalThis as any).HEADLESS === true ||
    (globalThis as any).AI_SUPPRESS_RENDER === true;
  if ((opts?.autoRender ?? true) && !suppress) adapter.render();

  notifyCheckpoint();
  return getCheckpointInfo();
}

/** Restore checkpoint and advance onto the next deterministic RNG branch. */
export function rerollFromCheckpoint(opts?: {
  autoRender?: boolean;
}): CheckpointInfo {
  if (!checkpoint) {
    throw new Error("No checkpoint set — cannot reroll");
  }
  return applyRerollBranch(checkpoint.rerollCount + 1, opts);
}

/** Hotkeys: F6 = set checkpoint, F8 = reroll (same input-field guard as undo). */
export function initCheckpointHotkeys({
  target = document,
}: { target?: Document | HTMLElement } = {}): void {
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

    if (e.key === "F6") {
      e.preventDefault();
      setCheckpoint();
      return;
    }
    if (e.key === "F8") {
      e.preventDefault();
      if (!checkpoint) return;
      rerollFromCheckpoint();
    }
  });
}

/** Test helper: wipe in-memory library + checkpoint. */
export function _resetPositionStoreForTests(): void {
  positions.clear();
  positionSeq = 0;
  checkpoint = null;
  sessionDeckAId = undefined;
  sessionDeckBId = undefined;
}
