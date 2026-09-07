/**
 * Session library for paste/file-imported decks.
 *
 * Storage: in-memory for the browser session. Durable path is JSON file
 * export/import (same pattern as positionStore). localStorage is unreliable in
 * this environment and is intentionally not used.
 *
 * On-disk `decks/*.local.json` is gitignored so scratch lists never become commit
 * noise. Imported decks live here in memory (and in user-downloaded JSON), not as
 * tracked repo files.
 */

import type { DeckManifestEntry } from "./deckManifest.js";
import type { RawDeckObject } from "./rawDeck.js";
import { isRawDeckObject } from "./rawDeck.js";
import { exportDecklistText } from "./deckImport.js";

/** Bump when the on-disk/export JSON shape changes incompatibly. */
export const IMPORTED_DECK_SCHEMA_VERSION = 1;

export type ImportedDeckRecord = {
  schemaVersion: number;
  id: string;
  label: string;
  deckName: string;
  class: string;
  raw: RawDeckObject;
  source: "paste" | "file";
  savedAt: number;
};

const library = new Map<string, ImportedDeckRecord>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function onImportedDeckLibraryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || "deck";
}

function makeId(deckName: string): string {
  const base = `imported_${slugify(deckName)}`;
  if (!library.has(base) && !library.has(`${base}.json`)) return base;
  let n = 2;
  while (library.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function listImportedDecks(): ImportedDeckRecord[] {
  return [...library.values()].sort((a, b) => b.savedAt - a.savedAt);
}

export function getImportedDeck(id: string): ImportedDeckRecord | null {
  const key = id.replace(/\.json$/i, "");
  return library.get(key) ?? null;
}

export function getImportedDeckRaw(id: string): RawDeckObject | null {
  return getImportedDeck(id)?.raw ?? null;
}

export function isImportedDeckId(id: string): boolean {
  return getImportedDeck(id) != null;
}

/** Manifest-shaped entries for the deck selectors. */
export function importedDeckManifestEntries(): DeckManifestEntry[] {
  return listImportedDecks().map((d) => ({
    file: `${d.id}.json`,
    id: d.id,
    label: `${d.label} (imported)`,
    category: "deck" as const,
  }));
}

export type SaveImportedDeckInput = {
  raw: RawDeckObject;
  label?: string;
  source?: "paste" | "file";
  /** Replace an existing id when re-importing under the same name. */
  id?: string;
};

export function saveImportedDeck(
  input: SaveImportedDeckInput,
): ImportedDeckRecord {
  const deckName =
    input.raw.deckName?.trim() || input.label?.trim() || "Imported Deck";
  const id = (input.id ?? makeId(deckName)).replace(/\.json$/i, "");
  const record: ImportedDeckRecord = {
    schemaVersion: IMPORTED_DECK_SCHEMA_VERSION,
    id,
    label: input.label?.trim() || deckName,
    deckName,
    class: input.raw.class ?? "Neutral",
    raw: {
      ...input.raw,
      deckName,
      class: input.raw.class ?? "Neutral",
    },
    source: input.source ?? "paste",
    savedAt: Date.now(),
  };
  library.set(id, record);
  notify();
  return record;
}

export function removeImportedDeck(id: string): boolean {
  const key = id.replace(/\.json$/i, "");
  const ok = library.delete(key);
  if (ok) notify();
  return ok;
}

export function clearImportedDecks(): void {
  library.clear();
  notify();
}

/** Serialize one deck for durable file export. */
export function exportImportedDeckJson(id: string): string {
  const rec = getImportedDeck(id);
  if (!rec) throw new Error(`Unknown imported deck: ${id}`);
  return JSON.stringify(
    {
      schemaVersion: IMPORTED_DECK_SCHEMA_VERSION,
      id: rec.id,
      label: rec.label,
      source: rec.source,
      savedAt: rec.savedAt,
      deck: rec.raw,
    },
    null,
    2,
  );
}

/** Export paste text for an imported (or any RawDeckObject) deck. */
export function exportImportedDecklistText(id: string): string {
  const rec = getImportedDeck(id);
  if (!rec) throw new Error(`Unknown imported deck: ${id}`);
  return exportDecklistText(rec.raw);
}

export function downloadImportedDeckJson(id: string, filename?: string): void {
  if (typeof document === "undefined") return;
  const json = exportImportedDeckJson(id);
  const safe = (filename ?? id).replace(/[^\w.-]+/g, "_") || "imported_deck";
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.svwb-deck.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDecklistText(
  text: string,
  filename = "decklist",
): void {
  if (typeof document === "undefined") return;
  const safe = filename.replace(/[^\w.-]+/g, "_") || "decklist";
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export class ImportedDeckSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportedDeckSchemaError";
  }
}

/**
 * Import a previously exported `.svwb-deck.json` (or plain RawDeckObject JSON).
 */
export function importDeckFromJsonText(
  text: string,
  opts?: { label?: string },
): ImportedDeckRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ImportedDeckSchemaError(
      `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ImportedDeckSchemaError("Deck file must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  let raw: RawDeckObject;
  let id: string | undefined;
  let label: string | undefined;
  const source: "paste" | "file" = "file";

  if (obj.deck && typeof obj.deck === "object" && !Array.isArray(obj.deck)) {
    raw = obj.deck as RawDeckObject;
    if (typeof obj.id === "string") id = obj.id;
    if (typeof obj.label === "string") label = obj.label;
  } else if (
    isRawDeckObject(obj as RawDeckObject) &&
    Array.isArray(obj.cards)
  ) {
    raw = obj as unknown as RawDeckObject;
  } else {
    throw new ImportedDeckSchemaError(
      "Expected { deck: { class, deckName, cards } } or a raw deck object with cards[]",
    );
  }

  if (!Array.isArray(raw.cards) || raw.cards.length === 0) {
    throw new ImportedDeckSchemaError("Deck has no cards[]");
  }

  const saveOpts: SaveImportedDeckInput = { raw, source };
  if (id) saveOpts.id = id;
  const resolvedLabel = opts?.label || label || raw.deckName;
  if (resolvedLabel) saveOpts.label = resolvedLabel;
  return saveImportedDeck(saveOpts);
}

/** Reset library (tests). */
export function resetImportedDeckLibraryForTests(): void {
  library.clear();
}
