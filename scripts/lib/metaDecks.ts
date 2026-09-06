/**
 * WBArts Rotation meta deck feed → repo deck files, index, and library diff.
 * Pure functions — network I/O lives in scripts/meta-decks.ts.
 */

import {
  DECK_CLASS_IDS,
  encodeDeckHash,
  type DeckCodeCatalog,
  type DeckFileObject,
} from "./deckCode.js";
import type { CardIndex } from "../../src/data/cardIndex.js";
import {
  REFERENCE_COPY_LIMIT,
  REFERENCE_DECK_SIZE,
  validateDeckRaw,
} from "../../src/data/deckValidation.js";
import { expandDeckEntries } from "../../src/data/deckExpand.js";

export const WBARTS_DECKS_URL =
  "https://sva.hypd.asia/api/decks?format=rotation&sort=recommended";
export const WBARTS_ARCHETYPES_URL = "https://sva.hypd.asia/api/archetypes";

export const META_DIFF_OVERLAP_THRESHOLD = 0.5;

export interface WbArtsDeck {
  id: string;
  name: string;
  class_id: number;
  cards: Record<string, number>;
  archetype: string;
  source: string;
  source_url: string;
  rating: number;
  win_count: number;
  gm_tier?: string | null;
  rank?: number;
  posted_at: string;
  recommendation_score: number;
  canonical_id: string;
}

export interface WbArtsArchetype {
  id: number | string;
  class_id: number;
  name_eng?: string;
  name_jpn?: string;
  name_chs?: string;
  name_cht?: string;
  name_kor?: string;
  resolved_name_eng?: string;
  resolved_name_jpn?: string;
  resolved_name_chs?: string;
  resolved_name_cht?: string;
  resolved_name_kor?: string;
  source_keys?: string[];
}

export interface MetaDeckIndexEntry {
  id: string;
  canonical_id: string;
  class: string;
  archetype: { id: string; name: string };
  source: string;
  source_url: string;
  rating: number;
  win_count: number;
  gm_tier?: string | null;
  posted_at: string;
  recommendation_score: number;
  fetched_at: string;
  file: string;
  hash: string;
}

export interface ProcessedMetaDeck {
  deck: DeckFileObject;
  indexEntry: MetaDeckIndexEntry;
  filename: string;
}

export interface SkippedMetaDeck {
  id: string;
  name: string;
  reasons: string[];
}

export interface MetaDeckDiffRow {
  metaDeck: string;
  metaId: string;
  closestLibrary: string;
  overlapPct: number;
  onlyMeta: string[];
  onlyOurs: string[];
  countDiffs: { name: string; meta: number; lib: number }[];
  noCounterpart: boolean;
}

export interface LibraryOrphanRow {
  libraryDeck: string;
  closestMeta: string;
  overlapPct: number;
  noCounterpart: boolean;
}

export function slugifyDeckSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function classNameFromId(classId: number): string {
  const name = DECK_CLASS_IDS[classId];
  if (!name) {
    throw new Error(`Unknown class_id ${classId}`);
  }
  return name;
}

export function archetypeLookupKey(id: number | string): string {
  return String(id);
}

/** Parse `local:<n>` or a bare numeric archetype id from the deck feed. */
export function parseArchetypeNumericId(archetypeId: string): string | null {
  const trimmed = archetypeId.trim();
  const localMatch = /^local:(\d+)$/i.exec(trimmed);
  if (localMatch) return localMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export function lookupArchetype(
  archetypeId: string,
  archetypes: ReadonlyMap<string, WbArtsArchetype>,
): WbArtsArchetype | undefined {
  const numeric = parseArchetypeNumericId(archetypeId);
  if (numeric) {
    const row = archetypes.get(numeric);
    if (row) return row;
  }
  return archetypes.get(archetypeId);
}

function pickNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function resolveArchetypeName(
  archetypeId: string,
  archetypes: ReadonlyMap<string, WbArtsArchetype>,
): string {
  const row = lookupArchetype(archetypeId, archetypes);
  if (!row) return archetypeId;
  return (
    pickNonEmpty(
      row.resolved_name_eng,
      row.name_eng,
      row.resolved_name_jpn,
      row.name_jpn,
      row.resolved_name_chs,
      row.name_chs,
    ) ?? archetypeId
  );
}

/** English archetype label when the API provides one; otherwise null. */
export function resolveArchetypeEnglishName(
  archetypeId: string,
  archetypes: ReadonlyMap<string, WbArtsArchetype>,
): string | null {
  const row = lookupArchetype(archetypeId, archetypes);
  if (!row) return null;
  return pickNonEmpty(row.resolved_name_eng, row.name_eng) ?? null;
}

export function buildArchetypeMap(
  archetypes: readonly WbArtsArchetype[],
): Map<string, WbArtsArchetype> {
  const map = new Map<string, WbArtsArchetype>();
  for (const row of archetypes) {
    map.set(archetypeLookupKey(row.id), row);
  }
  return map;
}

/** Author segment after the last " by " in a feed deck name (@ stripped). */
export function parseFeedDeckAuthor(feedName: string): string | null {
  const idx = feedName.lastIndexOf(" by ");
  if (idx < 0) return null;
  const author = feedName.slice(idx + 4).trim();
  if (!author) return null;
  return author.replace(/^@+/, "");
}

export function cardsRecordToDeckFile(
  feedDeck: WbArtsDeck,
  catalog: DeckCodeCatalog,
): { deck: DeckFileObject; cardIds: string[] } | { error: string } {
  const className = classNameFromId(feedDeck.class_id);
  const entries: { name: string; count: number }[] = [];
  const cardIds: string[] = [];

  for (const [id, count] of Object.entries(feedDeck.cards)) {
    const card = catalog.byId.get(String(id));
    if (!card) {
      return { error: `Unknown card id "${id}" (not in cards/all.json)` };
    }
    entries.push({ name: card.name, count });
    for (let i = 0; i < count; i++) {
      cardIds.push(String(id));
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const deck: DeckFileObject = {
    class: className,
    deckName: feedDeck.name,
    size: cardIds.length,
    cards: entries,
  };

  return { deck, cardIds };
}

function promoteValidationIssues(
  deck: DeckFileObject,
  deckFile: string,
  index: CardIndex,
): string[] {
  const result = validateDeckRaw(deck, deckFile, index);
  const reasons: string[] = [];

  for (const issue of result.issues) {
    reasons.push(issue.message);
  }

  for (const warning of result.warnings) {
    if (warning.kind === "size") {
      reasons.push(
        `Deck has ${result.cardCount} cards (must be ${REFERENCE_DECK_SIZE})`,
      );
    } else if (warning.kind === "copy_limit") {
      reasons.push(
        warning.message
          .replace(/\s*—\s*confirm with owner\/rules/, "")
          .replace(
            `reference limit is ${REFERENCE_COPY_LIMIT}`,
            `max ${REFERENCE_COPY_LIMIT} copies`,
          ),
      );
    }
  }

  const deckClass = deck.class;
  if (deckClass) {
    for (const entry of expandDeckEntries(deck)) {
      const name = entry.name;
      if (!name) continue;
      const card =
        index.byName.get(name) ??
        (entry.id != null ? index.byId.get(String(entry.id)) : undefined);
      if (!card) continue;
      const cardClass = typeof card.class === "string" ? card.class : undefined;
      if (cardClass && cardClass !== "Neutral" && cardClass !== deckClass) {
        reasons.push(
          `"${name}" is ${cardClass}, but deck class is ${deckClass}`,
        );
      }
    }
  }

  const deduped = [...new Set(reasons)];
  return deduped;
}

export function metaDeckFilename(
  feedDeck: WbArtsDeck,
  archetypes: ReadonlyMap<string, WbArtsArchetype>,
): string {
  const classSlug = classNameFromId(feedDeck.class_id).toLowerCase();
  const englishArchetype = resolveArchetypeEnglishName(
    feedDeck.archetype,
    archetypes,
  );

  if (englishArchetype) {
    const archetypeSlug = slugifyDeckSlug(englishArchetype);
    const author = parseFeedDeckAuthor(feedDeck.name);
    const authorPart = author ? `_by_${slugifyDeckSlug(author)}` : "";
    return `${classSlug}_${archetypeSlug}${authorPart}_${feedDeck.id}.json`;
  }

  const nameSlug = slugifyDeckSlug(feedDeck.name);
  return `${classSlug}_${nameSlug}_${feedDeck.id}.json`;
}

/** Files listed in the previous index but absent from the new index. */
export function listDroppedMetaDeckFiles(
  oldIndex: readonly MetaDeckIndexEntry[],
  newIndex: readonly MetaDeckIndexEntry[],
): string[] {
  const newFiles = new Set(newIndex.map((entry) => entry.file));
  return oldIndex
    .map((entry) => entry.file)
    .filter((file) => !newFiles.has(file));
}

export function processMetaDeck(
  feedDeck: WbArtsDeck,
  archetypes: ReadonlyMap<string, WbArtsArchetype>,
  catalog: DeckCodeCatalog,
  index: CardIndex,
  fetchedAt: string,
):
  | { ok: true; result: ProcessedMetaDeck }
  | { ok: false; skip: SkippedMetaDeck } {
  const converted = cardsRecordToDeckFile(feedDeck, catalog);
  if ("error" in converted) {
    return {
      ok: false,
      skip: {
        id: feedDeck.id,
        name: feedDeck.name,
        reasons: [converted.error],
      },
    };
  }

  const { deck, cardIds } = converted;
  const filename = metaDeckFilename(feedDeck, archetypes);
  const reasons = promoteValidationIssues(deck, filename, index);

  if (reasons.length > 0) {
    return {
      ok: false,
      skip: { id: feedDeck.id, name: feedDeck.name, reasons },
    };
  }

  const hash = encodeDeckHash({
    classId: feedDeck.class_id,
    cardIds,
  });

  const archetypeName = resolveArchetypeName(feedDeck.archetype, archetypes);

  const indexEntry: MetaDeckIndexEntry = {
    id: feedDeck.id,
    canonical_id: feedDeck.canonical_id,
    class: deck.class,
    archetype: { id: feedDeck.archetype, name: archetypeName },
    source: feedDeck.source,
    source_url: feedDeck.source_url,
    rating: feedDeck.rating,
    win_count: feedDeck.win_count,
    gm_tier: feedDeck.gm_tier ?? null,
    posted_at: feedDeck.posted_at,
    recommendation_score: feedDeck.recommendation_score,
    fetched_at: fetchedAt,
    file: filename,
    hash,
  };

  deck.size = REFERENCE_DECK_SIZE;

  return {
    ok: true,
    result: {
      deck,
      indexEntry,
      filename,
    },
  };
}

export function cardCountsFromDeck(deck: DeckFileObject): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of deck.cards ?? []) {
    if (!entry.name) continue;
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + (entry.count ?? 1));
  }
  return counts;
}

/** Count-aware Jaccard similarity on card-name multisets (0–1). */
export function countAwareJaccard(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let intersection = 0;
  let union = 0;
  const names = new Set([...a.keys(), ...b.keys()]);
  for (const name of names) {
    const ca = a.get(name) ?? 0;
    const cb = b.get(name) ?? 0;
    intersection += Math.min(ca, cb);
    union += Math.max(ca, cb);
  }
  return union === 0 ? 0 : intersection / union;
}

export function diffCardMaps(
  meta: Map<string, number>,
  lib: Map<string, number>,
): {
  onlyMeta: string[];
  onlyOurs: string[];
  countDiffs: { name: string; meta: number; lib: number }[];
} {
  const onlyMeta: string[] = [];
  const onlyOurs: string[] = [];
  const countDiffs: { name: string; meta: number; lib: number }[] = [];

  for (const [name, mc] of meta) {
    const lc = lib.get(name) ?? 0;
    if (lc === 0) {
      onlyMeta.push(`${name} ×${mc}`);
    } else if (mc !== lc) {
      countDiffs.push({ name, meta: mc, lib: lc });
    }
  }

  for (const [name, lc] of lib) {
    if (!meta.has(name)) {
      onlyOurs.push(`${name} ×${lc}`);
    }
  }

  onlyMeta.sort();
  onlyOurs.sort();
  countDiffs.sort((a, b) => a.name.localeCompare(b.name));

  return { onlyMeta, onlyOurs, countDiffs };
}

export interface LibraryDeckRef {
  file: string;
  deck: DeckFileObject;
}

export function diffMetaAgainstLibrary(
  metaDecks: readonly { id: string; deck: DeckFileObject }[],
  libraryDecks: readonly LibraryDeckRef[],
): { metaRows: MetaDeckDiffRow[]; orphanRows: LibraryOrphanRow[] } {
  const metaRows: MetaDeckDiffRow[] = [];
  const libByClass = new Map<string, LibraryDeckRef[]>();

  for (const lib of libraryDecks) {
    const cls = lib.deck.class ?? "";
    const list = libByClass.get(cls) ?? [];
    list.push(lib);
    libByClass.set(cls, list);
  }

  const metaMatchBest = new Map<string, { overlap: number; metaId: string }>();

  for (const meta of metaDecks) {
    const metaCounts = cardCountsFromDeck(meta.deck);
    const sameClass = libByClass.get(meta.deck.class ?? "") ?? [];

    let best: LibraryDeckRef | null = null;
    let bestOverlap = 0;

    for (const lib of sameClass) {
      const overlap = countAwareJaccard(
        metaCounts,
        cardCountsFromDeck(lib.deck),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = lib;
      }
    }

    const noCounterpart = bestOverlap < META_DIFF_OVERLAP_THRESHOLD;
    const libCounts = best ? cardCountsFromDeck(best.deck) : new Map();
    const { onlyMeta, onlyOurs, countDiffs } = diffCardMaps(
      metaCounts,
      libCounts,
    );

    if (best) {
      const prev = metaMatchBest.get(best.file);
      if (!prev || bestOverlap > prev.overlap) {
        metaMatchBest.set(best.file, { overlap: bestOverlap, metaId: meta.id });
      }
    }

    metaRows.push({
      metaDeck: meta.deck.deckName ?? meta.id,
      metaId: meta.id,
      closestLibrary: best?.file ?? "(none)",
      overlapPct: Math.round(bestOverlap * 1000) / 10,
      onlyMeta,
      onlyOurs,
      countDiffs,
      noCounterpart,
    });
  }

  const orphanRows: LibraryOrphanRow[] = [];
  for (const lib of libraryDecks) {
    const libCounts = cardCountsFromDeck(lib.deck);
    let bestMeta = "";
    let bestOverlap = 0;

    for (const meta of metaDecks) {
      if (meta.deck.class !== lib.deck.class) continue;
      const overlap = countAwareJaccard(
        libCounts,
        cardCountsFromDeck(meta.deck),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMeta = meta.deck.deckName ?? meta.id;
      }
    }

    orphanRows.push({
      libraryDeck: lib.file,
      closestMeta: bestMeta || "(none)",
      overlapPct: Math.round(bestOverlap * 1000) / 10,
      noCounterpart: bestOverlap < META_DIFF_OVERLAP_THRESHOLD,
    });
  }

  return { metaRows, orphanRows };
}

function formatList(items: string[], max = 5): string {
  if (items.length === 0) return "—";
  const shown = items.slice(0, max);
  const suffix = items.length > max ? ` (+${items.length - max} more)` : "";
  return shown.join(", ") + suffix;
}

function formatCountDiffs(
  diffs: { name: string; meta: number; lib: number }[],
): string {
  if (diffs.length === 0) return "—";
  return diffs.map((d) => `${d.name} meta×${d.meta} lib×${d.lib}`).join(", ");
}

export function formatMetaDiffTable(
  metaRows: readonly MetaDeckDiffRow[],
  orphanRows: readonly LibraryOrphanRow[],
): string {
  const lines: string[] = [];
  lines.push("## Meta vs library (closest same-class match)");
  lines.push("");
  lines.push(
    "| Meta deck | Closest library deck | Overlap % | Only in meta | Only in library | Count diffs |",
  );
  lines.push("| --- | --- | ---: | --- | --- | --- |");

  for (const row of metaRows) {
    const libLabel = row.noCounterpart
      ? `${row.closestLibrary} (no counterpart)`
      : row.closestLibrary;
    lines.push(
      `| ${row.metaDeck} | ${libLabel} | ${row.overlapPct} | ${formatList(row.onlyMeta)} | ${formatList(row.onlyOurs)} | ${formatCountDiffs(row.countDiffs)} |`,
    );
  }

  lines.push("");
  lines.push("## Library decks with no meta counterpart (<50% overlap)");
  lines.push("");
  lines.push("| Library deck | Closest meta deck | Overlap % |");
  lines.push("| --- | --- | ---: |");

  for (const row of orphanRows.filter((r) => r.noCounterpart)) {
    lines.push(
      `| ${row.libraryDeck} | ${row.closestMeta} | ${row.overlapPct} |`,
    );
  }

  if (orphanRows.every((r) => !r.noCounterpart)) {
    lines.push("| (none) | — | — |");
  }

  return lines.join("\n");
}

export function parseDecksFeed(body: unknown): WbArtsDeck[] {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid decks feed: not an object");
  }
  const decks = (body as { decks?: unknown }).decks;
  if (!Array.isArray(decks)) {
    throw new Error("Invalid decks feed: missing decks array");
  }
  return decks as WbArtsDeck[];
}

export function parseArchetypesFeed(body: unknown): WbArtsArchetype[] {
  if (body == null || typeof body !== "object") {
    throw new Error("Invalid archetypes feed: not an object");
  }
  const archetypes = (body as { archetypes?: unknown }).archetypes;
  if (!Array.isArray(archetypes)) {
    throw new Error("Invalid archetypes feed: missing archetypes array");
  }
  return archetypes as WbArtsArchetype[];
}
