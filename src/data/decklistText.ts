/**
 * Paste/export formats for community decklists.
 *
 * Accepted entry shapes (one card line):
 *   3x Card Name
 *   3 Card Name
 *   Card Name x3
 *   Card Name          (one copy; repeats accumulate)
 *
 * Blank lines, section headers, and stray punctuation are tolerated.
 * Lines that look like card entries but fail to match are NOT dropped —
 * callers must surface them via unmatched reporting after name resolution.
 */

export type DecklistParsedEntry = {
  /** Raw name text as written on the line (before index match). */
  rawName: string;
  count: number;
  /** 1-based source line number. */
  lineNumber: number;
  /** Original line text. */
  line: string;
};

export type DecklistSkippedLine = {
  lineNumber: number;
  line: string;
  reason: "blank" | "header" | "noise";
};

export type DecklistParseResult = {
  entries: DecklistParsedEntry[];
  skipped: DecklistSkippedLine[];
};

/** Collapse punctuation/whitespace for forgiving name match. */
export function normalizeCardNameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const HEADER_RE =
  /^(main(\s*deck)?|side(\s*board)?|sideboard|extra(\s*deck)?|deck\s*list|decklist|cards?|followers?|spells?|amulets?|class\s*:.*|craft\s*:.*|\/\/.*|#.*)$/i;

/** Lines that are clearly section chrome, not card entries. */
export function isDecklistHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (HEADER_RE.test(t)) return true;
  return false;
}

/**
 * Parse a single line into count + name, or null if not an entry shape.
 * Does not resolve the name against the card index.
 */
export function parseDecklistEntryLine(
  line: string,
): { rawName: string; count: number } | null {
  let t = line.trim();
  if (!t) return null;

  // Strip trailing stray punctuation clusters (not mid-name commas/apostrophes)
  t = t.replace(/[|;]+$/g, "").trim();
  // Common bullet / list prefixes
  t = t.replace(/^[-*•·]\s+/, "");

  // 3x Name / 3× Name / 3* Name
  let m = t.match(/^(\d+)\s*[x×*]\s+(.+)$/i);
  if (m?.[1] && m[2]) {
    const count = Number(m[1]);
    const rawName = m[2].trim();
    if (count > 0 && rawName) return { rawName, count };
  }

  // Name x3 / Name ×3
  m = t.match(/^(.+?)\s+[x×]\s*(\d+)\s*$/i);
  if (m?.[1] && m[2]) {
    const rawName = m[1].trim();
    const count = Number(m[2]);
    if (count > 0 && rawName) return { rawName, count };
  }

  // 3 Name  (count must be 1–2 digits and name must start with a letter)
  m = t.match(/^(\d{1,2})\s+([A-Za-z].+)$/);
  if (m?.[1] && m[2]) {
    const count = Number(m[1]);
    const rawName = m[2].trim();
    if (count > 0 && rawName) return { rawName, count };
  }

  // Plain name — one copy
  if (/[A-Za-z]/.test(t) && !/^\d+$/.test(t)) {
    return { rawName: t, count: 1 };
  }

  return null;
}

/** Parse full paste text into entry candidates + skipped chrome. */
export function parseDecklistText(text: string): DecklistParseResult {
  const entries: DecklistParsedEntry[] = [];
  const skipped: DecklistSkippedLine[] = [];
  const lines = String(text ?? "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNumber = i + 1;
    const trimmed = line.trim();
    if (!trimmed) {
      skipped.push({ lineNumber, line, reason: "blank" });
      continue;
    }
    if (isDecklistHeaderLine(trimmed)) {
      skipped.push({ lineNumber, line, reason: "header" });
      continue;
    }
    const parsed = parseDecklistEntryLine(trimmed);
    if (!parsed) {
      skipped.push({ lineNumber, line, reason: "noise" });
      continue;
    }
    entries.push({
      rawName: parsed.rawName,
      count: parsed.count,
      lineNumber,
      line,
    });
  }

  return { entries, skipped };
}

export type DecklistExportEntry = {
  name: string;
  count: number;
};

/**
 * Canonical paste format: `Nx Name` per unique card, sorted by name.
 * Stable for round-trip tests.
 */
export function formatDecklistText(
  entries: readonly DecklistExportEntry[],
): string {
  const merged = new Map<string, number>();
  for (const e of entries) {
    if (!e.name || e.count <= 0) continue;
    merged.set(e.name, (merged.get(e.name) ?? 0) + e.count);
  }
  const rows = [...merged.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
  );
  return rows.map(([name, count]) => `${count}x ${name}`).join("\n");
}
