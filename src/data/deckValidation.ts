import type { CardIndex } from "./cardIndex.js";
import type { RawDeck, RawDeckCardEntry } from "./rawDeck.js";
import { expandDeckEntries } from "./deckExpand.js";

/** Standard deck size in Shadowverse — informational only; owner must confirm rule. */
export const REFERENCE_DECK_SIZE = 40;

/** Typical per-card copy limit — informational only; owner must confirm rule. */
export const REFERENCE_COPY_LIMIT = 3;

export type DeckIssueKind = "parse" | "empty" | "missing_identifier" | "unknown_card";

export interface DeckValidationIssue {
  kind: DeckIssueKind;
  message: string;
  card?: string;
}

export type DeckWarningKind = "size" | "copy_limit";

export interface DeckValidationWarning {
  kind: DeckWarningKind;
  message: string;
}

export interface DeckValidationResult {
  deckFile: string;
  ok: boolean;
  issues: DeckValidationIssue[];
  warnings: DeckValidationWarning[];
  cardCount: number;
}

export function formatCardRef(entry: RawDeckCardEntry): string {
  if (entry.name) return entry.name;
  if (entry.id != null) return String(entry.id);
  return "(empty entry)";
}

export function resolveCardRef(
  index: CardIndex,
  entry: RawDeckCardEntry,
): boolean {
  if (entry.id != null && index.byId.has(String(entry.id))) {
    return true;
  }
  if (entry.name) {
    return (
      index.byName.has(entry.name) || index.tokensByName.has(entry.name)
    );
  }
  return false;
}

export function findUnknownCards(
  entries: readonly RawDeckCardEntry[],
  index: CardIndex,
): string[] {
  const unknown = new Set<string>();
  for (const entry of entries) {
    if (!entry.name && entry.id == null) {
      unknown.add("(empty entry)");
      continue;
    }
    if (!resolveCardRef(index, entry)) {
      unknown.add(formatCardRef(entry));
    }
  }
  return [...unknown];
}

function countByKey(entries: readonly RawDeckCardEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key =
      entry.name ??
      (entry.id != null ? `id:${entry.id}` : "(empty entry)");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function validateDeckRaw(
  raw: unknown,
  deckFile: string,
  index: CardIndex,
): DeckValidationResult {
  const issues: DeckValidationIssue[] = [];
  const warnings: DeckValidationWarning[] = [];

  if (raw == null || (typeof raw !== "object" && !Array.isArray(raw))) {
    issues.push({
      kind: "parse",
      message: "Deck file is not valid JSON object or array",
    });
    return { deckFile, ok: false, issues, warnings, cardCount: 0 };
  }

  const entries = expandDeckEntries(raw as RawDeck);

  if (entries.length === 0) {
    issues.push({
      kind: "empty",
      message: "Deck contains no cards",
    });
    return { deckFile, ok: false, issues, warnings, cardCount: 0 };
  }

  for (const entry of entries) {
    if (!entry.name && entry.id == null) {
      issues.push({
        kind: "missing_identifier",
        message: "Deck entry missing both name and id",
      });
    }
  }

  const unknown = findUnknownCards(entries, index);
  for (const card of unknown) {
    if (card === "(empty entry)") continue;
    issues.push({
      kind: "unknown_card",
      message: `Unknown card "${card}" (not in cards/all.json or token_details.json)`,
      card,
    });
  }

  if (entries.length !== REFERENCE_DECK_SIZE) {
    warnings.push({
      kind: "size",
      message: `Deck has ${entries.length} cards (reference size is ${REFERENCE_DECK_SIZE} — confirm with owner/rules)`,
    });
  }

  for (const [key, count] of countByKey(entries)) {
    if (count > REFERENCE_COPY_LIMIT) {
      warnings.push({
        kind: "copy_limit",
        message: `"${key}" appears ${count} times (reference limit is ${REFERENCE_COPY_LIMIT} — confirm with owner/rules)`,
      });
    }
  }

  const ok = issues.length === 0;

  return {
    deckFile,
    ok,
    issues,
    warnings,
    cardCount: entries.length,
  };
}
