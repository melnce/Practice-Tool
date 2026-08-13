/**
 * In-memory puzzle library + JSON export/import.
 * Positions are embedded; durable sharing is file export (not localStorage).
 */
import {
  POSITION_SCHEMA_VERSION,
  parsePositionJson,
  type SavedPosition,
} from "../positionStore.js";
import { parseScriptDocument } from "../script/parse.js";
import type { ScriptDocument } from "../script/types.js";
import type { PlayerSlot } from "../types/index.js";
import { logEvent } from "../logger.js";
import {
  PUZZLE_SCHEMA_VERSION,
  PuzzleSchemaError,
  type PuzzleBestAttempt,
  type PuzzleDefinition,
  type PuzzleGoal,
} from "./types.js";

const puzzles = new Map<string, PuzzleDefinition>();
let puzzleSeq = 0;

type ChangeListener = () => void;
let onChange: ChangeListener | null = null;

export function onPuzzleLibraryChange(cb: ChangeListener | null): void {
  onChange = cb;
}

function notify(): void {
  onChange?.();
}

function newPuzzleId(): string {
  puzzleSeq += 1;
  return `puzzle_${puzzleSeq.toString(36)}_${Date.now().toString(36)}`;
}

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

function isPlayer(v: unknown): v is PlayerSlot {
  return v === "first" || v === "second";
}

function parseGoal(raw: unknown): PuzzleGoal {
  if (!raw || typeof raw !== "object") {
    throw new PuzzleSchemaError("goal: expected object");
  }
  const g = raw as Record<string, unknown>;
  if (g.type === "enemy_leader_hp_0") return { type: "enemy_leader_hp_0" };
  if (g.type === "clear_enemy_board") return { type: "clear_enemy_board" };
  if (g.type === "survive_n_turns") {
    if (typeof g.n !== "number" || !Number.isInteger(g.n) || g.n < 1) {
      throw new PuzzleSchemaError("goal.n: expected positive integer");
    }
    return { type: "survive_n_turns", n: g.n };
  }
  throw new PuzzleSchemaError(`goal.type: unknown ${JSON.stringify(g.type)}`);
}

function parseBestAttempt(raw: unknown): PuzzleBestAttempt | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== "object") {
    throw new PuzzleSchemaError("bestAttempt: expected object");
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.cardsPlayed !== "number" ||
    !Number.isInteger(o.cardsPlayed) ||
    o.cardsPlayed < 0
  ) {
    throw new PuzzleSchemaError("bestAttempt.cardsPlayed: non-negative int");
  }
  if (
    typeof o.ppSpent !== "number" ||
    !Number.isInteger(o.ppSpent) ||
    o.ppSpent < 0
  ) {
    throw new PuzzleSchemaError("bestAttempt.ppSpent: non-negative int");
  }
  return { cardsPlayed: o.cardsPlayed, ppSpent: o.ppSpent };
}

/**
 * Parse puzzle JSON. Does not mutate the library or live game.
 * Reuses position + script parsers so embedded payloads stay strict.
 */
export function parsePuzzleJson(json: string): PuzzleDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json, jsonReviver);
  } catch (e) {
    throw new PuzzleSchemaError(
      `Invalid puzzle JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PuzzleSchemaError("Puzzle JSON must be an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== PUZZLE_SCHEMA_VERSION) {
    throw new PuzzleSchemaError(
      `Unsupported puzzle schema version: ${String(obj.schemaVersion)} (expected ${PUZZLE_SCHEMA_VERSION})`,
    );
  }
  if (typeof obj.id !== "string" || !obj.id) {
    throw new PuzzleSchemaError("Puzzle JSON missing id");
  }
  if (typeof obj.title !== "string" || !obj.title.trim()) {
    throw new PuzzleSchemaError("Puzzle JSON missing title");
  }
  if (!isPlayer(obj.solverSide)) {
    throw new PuzzleSchemaError('solverSide: expected "first" | "second"');
  }
  if (
    typeof obj.turnLimit !== "number" ||
    !Number.isInteger(obj.turnLimit) ||
    obj.turnLimit < 1
  ) {
    throw new PuzzleSchemaError("turnLimit: expected positive integer");
  }
  if (!obj.position || typeof obj.position !== "object") {
    throw new PuzzleSchemaError("Puzzle JSON missing position");
  }
  // Validate embedded position via the same gate as standalone exports.
  const position = parsePositionJson(
    JSON.stringify(obj.position, jsonReplacer),
  );
  if (position.schemaVersion !== POSITION_SCHEMA_VERSION) {
    throw new PuzzleSchemaError("Embedded position schema mismatch");
  }

  const goal = parseGoal(obj.goal);
  if (goal.type === "survive_n_turns" && goal.n !== obj.turnLimit) {
    throw new PuzzleSchemaError(
      `survive_n_turns: goal.n (${goal.n}) must equal turnLimit (${obj.turnLimit})`,
    );
  }

  let opponentScript: ScriptDocument | undefined;
  if (obj.opponentScript !== undefined && obj.opponentScript !== null) {
    opponentScript = parseScriptDocument(obj.opponentScript);
  }

  let scriptCursor: number | undefined;
  if (obj.scriptCursor !== undefined) {
    if (
      typeof obj.scriptCursor !== "number" ||
      !Number.isInteger(obj.scriptCursor) ||
      obj.scriptCursor < 0
    ) {
      throw new PuzzleSchemaError(
        "scriptCursor: expected non-negative integer",
      );
    }
    scriptCursor = obj.scriptCursor;
  }

  const bestAttempt = parseBestAttempt(obj.bestAttempt);

  const def: PuzzleDefinition = {
    schemaVersion: PUZZLE_SCHEMA_VERSION,
    id: obj.id,
    title: obj.title.trim(),
    solverSide: obj.solverSide,
    turnLimit: obj.turnLimit,
    goal,
    position,
    savedAt:
      typeof obj.savedAt === "number" && Number.isFinite(obj.savedAt)
        ? obj.savedAt
        : Date.now(),
  };
  if (typeof obj.description === "string" && obj.description.trim()) {
    def.description = obj.description.trim();
  }
  if (opponentScript) def.opponentScript = opponentScript;
  if (scriptCursor !== undefined) def.scriptCursor = scriptCursor;
  if (bestAttempt) def.bestAttempt = bestAttempt;
  return def;
}

export type CreatePuzzleInput = {
  title: string;
  description?: string;
  solverSide: PlayerSlot;
  turnLimit: number;
  goal: PuzzleGoal;
  position: SavedPosition;
  opponentScript?: ScriptDocument;
  scriptCursor?: number;
  id?: string;
};

/** Save a new puzzle (or replace by id) into the session library. */
export function savePuzzle(input: CreatePuzzleInput): PuzzleDefinition {
  const title = (input.title || "").trim() || "Untitled puzzle";
  if (input.turnLimit < 1 || !Number.isInteger(input.turnLimit)) {
    throw new PuzzleSchemaError("turnLimit must be a positive integer");
  }
  if (
    input.goal.type === "survive_n_turns" &&
    input.goal.n !== input.turnLimit
  ) {
    throw new PuzzleSchemaError(
      "survive_n_turns requires goal.n === turnLimit",
    );
  }

  const id = input.id ?? newPuzzleId();
  const existing = puzzles.get(id);
  const def: PuzzleDefinition = {
    schemaVersion: PUZZLE_SCHEMA_VERSION,
    id,
    title,
    solverSide: input.solverSide,
    turnLimit: input.turnLimit,
    goal: structuredClone(input.goal),
    // Deep-clone position so later game mutations cannot alias into the library.
    position: JSON.parse(
      JSON.stringify(input.position, jsonReplacer),
      jsonReviver,
    ) as SavedPosition,
    savedAt: Date.now(),
  };
  if (input.description?.trim()) def.description = input.description.trim();
  if (input.opponentScript) {
    def.opponentScript = structuredClone(input.opponentScript);
  }
  if (input.scriptCursor !== undefined) {
    def.scriptCursor = input.scriptCursor;
  }
  if (existing?.bestAttempt) {
    def.bestAttempt = { ...existing.bestAttempt };
  }

  puzzles.set(id, def);
  logEvent("puzzle_save", {
    id,
    title,
    goal: def.goal.type,
    turnLimit: def.turnLimit,
  });
  notify();
  return def;
}

export function listPuzzles(): PuzzleDefinition[] {
  return [...puzzles.values()].sort((a, b) => b.savedAt - a.savedAt);
}

export function getPuzzle(id: string): PuzzleDefinition | undefined {
  return puzzles.get(id);
}

export function deletePuzzle(id: string): boolean {
  const ok = puzzles.delete(id);
  if (ok) notify();
  return ok;
}

export function updatePuzzleBestAttempt(
  id: string,
  attempt: PuzzleBestAttempt,
): PuzzleDefinition | null {
  const existing = puzzles.get(id);
  if (!existing) return null;
  const prev = existing.bestAttempt;
  const better =
    !prev ||
    attempt.cardsPlayed < prev.cardsPlayed ||
    (attempt.cardsPlayed === prev.cardsPlayed &&
      attempt.ppSpent < prev.ppSpent);
  if (better) {
    existing.bestAttempt = { ...attempt };
    notify();
  }
  return existing;
}

export function exportPuzzleToJson(id: string): string {
  const existing = puzzles.get(id);
  if (!existing) throw new Error(`No puzzle with id "${id}"`);
  return JSON.stringify(existing, jsonReplacer, 2);
}

export function exportPuzzleRecordToJson(def: PuzzleDefinition): string {
  return JSON.stringify(def, jsonReplacer, 2);
}

export function importPuzzleFromJson(json: string): PuzzleDefinition {
  const record = parsePuzzleJson(json);
  if (puzzles.has(record.id)) {
    record.id = newPuzzleId();
  }
  puzzles.set(record.id, record);
  notify();
  logEvent("puzzle_import", { id: record.id, title: record.title });
  return record;
}

export function downloadPuzzleJson(id: string, filename?: string): void {
  if (typeof document === "undefined") return;
  const json = exportPuzzleToJson(id);
  const record = puzzles.get(id)!;
  const safeName = (filename || record.title || "puzzle")
    .replace(/[^\w-]+/g, "_")
    .slice(0, 64);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.svwb-puzzle.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/** Test helper: wipe library. */
export function _resetPuzzleStoreForTests(): void {
  puzzles.clear();
  puzzleSeq = 0;
}
