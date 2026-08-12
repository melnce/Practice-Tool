/**
 * Import pipeline: paste → match → validate → coverage warning → RawDeck.
 *
 * Unmatched lines are never silently dropped.
 */

import type { CardIndex } from "./cardIndex.js";
import type { CardTemplate } from "../core/types/index.js";
import {
  getImplementationStatus,
  type ImplementationStatus,
} from "./cardImplementationStatus.js";
import {
  formatDecklistText,
  normalizeCardNameKey,
  parseDecklistText,
  type DecklistParsedEntry,
} from "./decklistText.js";
import {
  REFERENCE_COPY_LIMIT,
  REFERENCE_DECK_SIZE,
  validateDeckRaw,
  type DeckValidationIssue,
  type DeckValidationResult,
  type DeckValidationWarning,
} from "./deckValidation.js";
import { expandDeckEntries } from "./deckExpand.js";
import type { RawDeckObject } from "./rawDeck.js";

export type UnmatchedDecklistLine = {
  lineNumber: number;
  line: string;
  rawName: string;
};

export type MatchedDeckCard = {
  name: string;
  id?: string;
  count: number;
  class?: string;
  card: CardTemplate;
};

export type DecklistMatchResult = {
  matched: MatchedDeckCard[];
  unmatched: UnmatchedDecklistLine[];
  /** Total copies after matching (sum of counts). */
  cardCount: number;
};

export type ImportCoverageFlag = {
  name: string;
  id: string;
  status: Exclude<ImplementationStatus, "implemented">;
};

export type DeckImportResult = {
  ok: boolean;
  /** Present when matching produced a resolvable deck object (may still fail validation). */
  raw: RawDeckObject | null;
  matched: MatchedDeckCard[];
  unmatched: UnmatchedDecklistLine[];
  validation: DeckValidationResult;
  coverage: ImportCoverageFlag[];
  /** Human-readable problems to show in the UI. */
  messages: string[];
};

/** Build a normalized-name → card lookup (main cards only — tokens are not deckable). */
export function buildNameLookup(index: CardIndex): Map<string, CardTemplate> {
  const map = new Map<string, CardTemplate>();
  for (const [name, card] of index.byName) {
    const key = normalizeCardNameKey(name);
    if (!key) continue;
    // Prefer first insertion; names are unique in the index.
    if (!map.has(key)) map.set(key, card);
  }
  return map;
}

export function matchDecklistEntries(
  entries: readonly DecklistParsedEntry[],
  index: CardIndex,
): DecklistMatchResult {
  const lookup = buildNameLookup(index);
  const byName = new Map<string, MatchedDeckCard>();
  const unmatched: UnmatchedDecklistLine[] = [];

  for (const entry of entries) {
    const key = normalizeCardNameKey(entry.rawName);
    const card = key ? lookup.get(key) : undefined;
    if (!card || !card.name) {
      unmatched.push({
        lineNumber: entry.lineNumber,
        line: entry.line,
        rawName: entry.rawName,
      });
      continue;
    }
    const existing = byName.get(card.name);
    if (existing) {
      existing.count += entry.count;
    } else {
      const row: MatchedDeckCard = {
        name: card.name,
        count: entry.count,
        card,
      };
      if (card.id != null) row.id = String(card.id);
      if (typeof card.class === "string") row.class = card.class;
      byName.set(card.name, row);
    }
  }

  const matched = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const cardCount = matched.reduce((n, c) => n + c.count, 0);
  return { matched, unmatched, cardCount };
}

const CRAFT_CLASSES = new Set([
  "Forestcraft",
  "Swordcraft",
  "Runecraft",
  "Dragoncraft",
  "Abysscraft",
  "Havencraft",
  "Portalcraft",
]);

/**
 * Infer the deck's craft from non-Neutral cards. Returns null if empty or mixed.
 */
export function inferDeckClass(
  matched: readonly MatchedDeckCard[],
): string | null {
  const crafts = new Set<string>();
  for (const m of matched) {
    const c = m.class;
    if (!c || c === "Neutral") continue;
    crafts.add(c);
  }
  if (crafts.size === 1) return [...crafts][0]!;
  return null;
}

export function listImportCoverageFlags(
  matched: readonly MatchedDeckCard[],
): ImportCoverageFlag[] {
  const flags: ImportCoverageFlag[] = [];
  const seen = new Set<string>();
  for (const m of matched) {
    const status =
      (m.card.implementationStatus as ImplementationStatus | undefined) ??
      getImplementationStatus(m.card);
    if (status !== "unimplemented" && status !== "partial") continue;
    const id = String(m.id ?? m.name);
    if (seen.has(id)) continue;
    seen.add(id);
    flags.push({ name: m.name, id, status });
  }
  flags.sort((a, b) => a.name.localeCompare(b.name));
  return flags;
}

/**
 * Promote size/copy warnings to hard issues and enforce class legality.
 * Built on top of validateDeckRaw so check:decks conventions stay shared.
 */
export function validateDeckForImport(
  raw: RawDeckObject,
  deckFile: string,
  index: CardIndex,
): DeckValidationResult {
  const base = validateDeckRaw(raw, deckFile, index);
  const issues: DeckValidationIssue[] = [...base.issues];
  const warnings: DeckValidationWarning[] = [];

  for (const w of base.warnings) {
    if (w.kind === "size") {
      issues.push({
        kind: "size",
        message: `Deck has ${base.cardCount} cards (must be ${REFERENCE_DECK_SIZE})`,
      });
    } else if (w.kind === "copy_limit") {
      issues.push({
        kind: "copy_limit",
        message: w.message
          .replace(/\s*—\s*confirm with owner\/rules/, "")
          .replace(
            `reference limit is ${REFERENCE_COPY_LIMIT}`,
            `max ${REFERENCE_COPY_LIMIT} copies`,
          ),
      });
    } else {
      warnings.push(w);
    }
  }

  // Class legality: every card must be Neutral or the deck's craft
  const deckClass = raw.class;
  if (deckClass && CRAFT_CLASSES.has(deckClass)) {
    for (const entry of expandDeckEntries(raw)) {
      const name = entry.name;
      if (!name) continue;
      const card =
        index.byName.get(name) ??
        (entry.id != null ? index.byId.get(String(entry.id)) : undefined);
      if (!card) continue;
      const cardClass = typeof card.class === "string" ? card.class : undefined;
      if (cardClass && cardClass !== "Neutral" && cardClass !== deckClass) {
        issues.push({
          kind: "class_illegal",
          message: `"${name}" is ${cardClass}, but deck class is ${deckClass}`,
          card: name,
        });
      }
    }
  }

  // Deduplicate class_illegal by card
  const seenClass = new Set<string>();
  const deduped: DeckValidationIssue[] = [];
  for (const issue of issues) {
    if (issue.kind === "class_illegal" && issue.card) {
      if (seenClass.has(issue.card)) continue;
      seenClass.add(issue.card);
    }
    deduped.push(issue);
  }

  return {
    deckFile,
    ok: deduped.length === 0,
    issues: deduped,
    warnings,
    cardCount: base.cardCount,
  };
}

function buildRawDeck(
  matched: MatchedDeckCard[],
  opts: { deckName: string; deckClass: string },
): RawDeckObject {
  return {
    class: opts.deckClass,
    deckName: opts.deckName,
    size: REFERENCE_DECK_SIZE,
    cards: matched.map((m) => ({
      name: m.name,
      ...(m.id ? { id: m.id } : {}),
      count: m.count,
    })),
  };
}

export type ImportDecklistOptions = {
  deckName?: string;
  /** Override craft; otherwise inferred from matched cards. */
  deckClass?: string;
  deckFile?: string;
};

/**
 * Full paste import: parse → match → validate → coverage.
 * Partial matches never pretend to be complete — unmatched lines flip ok=false.
 */
export function importDecklistFromText(
  text: string,
  index: CardIndex,
  options: ImportDecklistOptions = {},
): DeckImportResult {
  const deckFile = options.deckFile ?? "imported.txt";
  const parsed = parseDecklistText(text);
  const match = matchDecklistEntries(parsed.entries, index);
  const messages: string[] = [];

  for (const u of match.unmatched) {
    messages.push(
      `Unmatched line ${u.lineNumber}: "${u.rawName}" (not in card index)`,
    );
  }

  if (parsed.entries.length === 0) {
    const validation: DeckValidationResult = {
      deckFile,
      ok: false,
      issues: [{ kind: "empty", message: "No card lines found in paste" }],
      warnings: [],
      cardCount: 0,
    };
    return {
      ok: false,
      raw: null,
      matched: [],
      unmatched: match.unmatched,
      validation,
      coverage: [],
      messages: [...messages, validation.issues[0]!.message],
    };
  }

  // Mixed crafts before building raw
  const crafts = new Set(
    match.matched
      .map((m) => m.class)
      .filter((c): c is string => !!c && c !== "Neutral"),
  );
  let deckClass = options.deckClass?.trim() || "";
  if (!deckClass) {
    deckClass = inferDeckClass(match.matched) ?? "";
  }
  if (!deckClass && crafts.size === 0) {
    deckClass = "Neutral";
  }
  if (crafts.size > 1 && !options.deckClass) {
    messages.push(
      `Multiple crafts in list: ${[...crafts].sort().join(", ")} — pick a class or remove illegal cards`,
    );
  }

  const deckName =
    options.deckName?.trim() ||
    (deckClass && deckClass !== "Neutral"
      ? `Imported ${deckClass}`
      : "Imported Deck");

  const raw =
    match.matched.length > 0
      ? buildRawDeck(match.matched, {
          deckName,
          deckClass: deckClass || "Neutral",
        })
      : null;

  const validation = raw
    ? validateDeckForImport(raw, deckFile, index)
    : ({
        deckFile,
        ok: false,
        issues: [
          {
            kind: "empty",
            message: "No cards matched the card index",
          },
        ],
        warnings: [],
        cardCount: 0,
      } satisfies DeckValidationResult);

  // If user didn't specify class and we have mixed crafts, force failure
  if (crafts.size > 1 && !options.deckClass) {
    validation.issues.push({
      kind: "class_illegal",
      message: `Multiple crafts in list: ${[...crafts].sort().join(", ")}`,
    });
    validation.ok = false;
  }

  for (const issue of validation.issues) {
    messages.push(issue.message);
  }

  const coverage = listImportCoverageFlags(match.matched);
  if (coverage.length > 0) {
    const n = coverage.filter((c) => c.status === "unimplemented").length;
    const p = coverage.filter((c) => c.status === "partial").length;
    const parts: string[] = [];
    if (n > 0) {
      parts.push(`${n} card${n === 1 ? "" : "s"} have no implemented effects`);
    }
    if (p > 0) {
      parts.push(`${p} card${p === 1 ? "" : "s"} use unknown effect ops`);
    }
    messages.push(
      `Coverage warning: ${parts.join(" · ")} — results may be misleading`,
    );
  }

  const ok = match.unmatched.length === 0 && validation.ok;

  return {
    ok,
    raw,
    matched: match.matched,
    unmatched: match.unmatched,
    validation: { ...validation, ok },
    coverage,
    messages,
  };
}

/** Export a RawDeckObject (or matched list) back to canonical paste text. */
export function exportDecklistText(
  raw: RawDeckObject | { name: string; count: number }[],
): string {
  if (Array.isArray(raw)) {
    return formatDecklistText(raw);
  }
  const cards = (raw.cards ?? []).map((c) => ({
    name: c.name ?? (c.id != null ? String(c.id) : ""),
    count: c.count ?? 1,
  }));
  return formatDecklistText(cards);
}

export { REFERENCE_COPY_LIMIT, REFERENCE_DECK_SIZE };
