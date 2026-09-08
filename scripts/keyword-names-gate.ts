/**
 * Keyword-name gate — every keyword in card data must have a handler in KEYWORD_MAP.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeKeywordName } from "../src/logic/core/keywords/registry.js";
import { KEYWORD_MAP } from "../src/logic/core/keywords/apply.js";
import type { CardJson } from "./lib/loadCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
export const KEYWORD_GATE_ALLOWLIST_PATH = path.join(
  ROOT,
  "cards",
  "keyword-gate-allowlist.json",
);

export type KeywordGateAllowEntry = {
  cardId: string;
  keyword: string;
  reason: string;
};

export type KeywordGateIssue = {
  cardId: string;
  cardName: string;
  jsonPath: string;
  kind: "error" | "warn";
  message: string;
  rawKeyword?: string;
  normalizedKeyword?: string;
};

type SpellingCount = Map<string, number>;

function walkKeywordsArray(
  keywords: unknown,
  visitor: (raw: string, jsonPath: string) => void,
  jsonPath: string,
): void {
  if (!Array.isArray(keywords)) return;
  keywords.forEach((entry, index) => {
    const entryPath = `${jsonPath}[${index}]`;
    if (typeof entry === "string") {
      visitor(entry, entryPath);
      return;
    }
    if (entry && typeof entry === "object") {
      const name = (entry as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) {
        visitor(name, `${entryPath}.name`);
      } else {
        visitor("", entryPath);
      }
    } else {
      visitor("", entryPath);
    }
  });
}

function walkCardKeywords(
  node: unknown,
  card: CardJson,
  visitor: (raw: string, jsonPath: string) => void,
  pathPrefix = "",
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      walkCardKeywords(child, card, visitor, `${pathPrefix}[${index}]`);
    });
    return;
  }

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (key === "keywords") {
      walkKeywordsArray(value, visitor, childPath);
    }
    walkCardKeywords(value, card, visitor, childPath);
  }
}

function collectSpellings(cards: CardJson[]): Map<string, SpellingCount> {
  const byNormalized = new Map<string, SpellingCount>();

  for (const card of cards) {
    walkCardKeywords(card, card, (raw) => {
      if (!raw.trim()) return;
      const normalized = normalizeKeywordName(raw);
      if (!normalized) return;
      if (!byNormalized.has(normalized)) {
        byNormalized.set(normalized, new Map());
      }
      const counts = byNormalized.get(normalized)!;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    });
  }

  return byNormalized;
}

function canonicalSpellingFor(counts: SpellingCount): string {
  let best = "";
  let bestCount = -1;
  for (const [raw, count] of counts) {
    if (count > bestCount) {
      best = raw;
      bestCount = count;
    }
  }
  return best;
}

export function checkKeywordNamesForCard(
  card: CardJson,
  spellingsByNormalized: Map<string, SpellingCount>,
): KeywordGateIssue[] {
  const issues: KeywordGateIssue[] = [];

  walkCardKeywords(card, card, (raw, jsonPath) => {
    if (!raw.trim()) {
      issues.push({
        cardId: card.id,
        cardName: card.name,
        jsonPath,
        kind: "error",
        message: `keyword entry at ${jsonPath} has no name and no string form`,
      });
      return;
    }

    const normalized = normalizeKeywordName(raw);
    if (!normalized) {
      issues.push({
        cardId: card.id,
        cardName: card.name,
        jsonPath,
        kind: "error",
        message: `keyword entry at ${jsonPath} has no name and no string form`,
        rawKeyword: raw,
      });
      return;
    }

    if (!KEYWORD_MAP[normalized]) {
      issues.push({
        cardId: card.id,
        cardName: card.name,
        jsonPath,
        kind: "error",
        message: `unknown keyword "${raw}" (normalized "${normalized}") at ${jsonPath} — no handler in KEYWORD_MAP`,
        rawKeyword: raw,
        normalizedKeyword: normalized,
      });
      return;
    }

    const spellings = spellingsByNormalized.get(normalized);
    if (!spellings) return;
    const canonical = canonicalSpellingFor(spellings);
    if (raw !== canonical) {
      issues.push({
        cardId: card.id,
        cardName: card.name,
        jsonPath,
        kind: "error",
        message: `non-canonical keyword spelling "${raw}" at ${jsonPath} — canonical is "${canonical}"`,
        rawKeyword: raw,
        normalizedKeyword: normalized,
      });
    }
  });

  return issues;
}

export function loadKeywordGateAllowlist(): KeywordGateAllowEntry[] {
  if (!fs.existsSync(KEYWORD_GATE_ALLOWLIST_PATH)) return [];
  const raw = JSON.parse(
    fs.readFileSync(KEYWORD_GATE_ALLOWLIST_PATH, "utf-8"),
  ) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is KeywordGateAllowEntry =>
      entry != null &&
      typeof entry === "object" &&
      typeof (entry as KeywordGateAllowEntry).cardId === "string" &&
      typeof (entry as KeywordGateAllowEntry).keyword === "string" &&
      typeof (entry as KeywordGateAllowEntry).reason === "string",
  );
}

function matchesAllowlist(
  issue: KeywordGateIssue,
  entry: KeywordGateAllowEntry,
): boolean {
  if (issue.cardId !== entry.cardId) return false;
  const issueNorm =
    issue.normalizedKeyword ?? normalizeKeywordName(entry.keyword);
  const entryNorm = normalizeKeywordName(entry.keyword);
  return issueNorm === entryNorm || issue.rawKeyword === entry.keyword;
}

export type KeywordGateReport = {
  issues: KeywordGateIssue[];
  errors: KeywordGateIssue[];
  warnings: KeywordGateIssue[];
  census: {
    canonical: Array<{ spelling: string; count: number }>;
    nonCanonical: Array<{ spelling: string; count: number }>;
    singletons: Array<{ spelling: string; count: number }>;
    entriesWithNoName: number;
  };
  exitCode: number;
};

export function runKeywordNamesGate(
  cards: CardJson[],
  allowlistOverride?: KeywordGateAllowEntry[],
): KeywordGateReport {
  const spellingsByNormalized = collectSpellings(cards);
  const issues = cards.flatMap((card) =>
    checkKeywordNamesForCard(card, spellingsByNormalized),
  );
  const errors = issues.filter((i) => i.kind === "error");
  const warnings = issues.filter((i) => i.kind === "warn");

  const allowlist = allowlistOverride ?? loadKeywordGateAllowlist();
  const unmatchedAllowlist: KeywordGateAllowEntry[] = [];
  const unallowlistedErrors: KeywordGateIssue[] = [];

  for (const entry of allowlist) {
    const matched = errors.some((issue) => matchesAllowlist(issue, entry));
    if (!matched) unmatchedAllowlist.push(entry);
  }

  for (const issue of errors) {
    const allowed = allowlist.some((entry) => matchesAllowlist(issue, entry));
    if (!allowed) unallowlistedErrors.push(issue);
  }

  const canonical: Array<{ spelling: string; count: number }> = [];
  const nonCanonical: Array<{ spelling: string; count: number }> = [];
  const singletons: Array<{ spelling: string; count: number }> = [];

  for (const counts of spellingsByNormalized.values()) {
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const canon = canonicalSpellingFor(counts);
    if (total === 1 && counts.size === 1) {
      singletons.push({ spelling: canon, count: 1 });
      continue;
    }
    for (const [raw, count] of counts) {
      if (raw === canon) canonical.push({ spelling: raw, count });
      else nonCanonical.push({ spelling: raw, count });
    }
  }

  canonical.sort(
    (a, b) => b.count - a.count || a.spelling.localeCompare(b.spelling),
  );
  nonCanonical.sort(
    (a, b) => b.count - a.count || a.spelling.localeCompare(b.spelling),
  );
  singletons.sort((a, b) => a.spelling.localeCompare(b.spelling));

  const entriesWithNoName = errors.filter((e) =>
    e.message.includes("no name and no string form"),
  ).length;

  const exitCode =
    unallowlistedErrors.length > 0 || unmatchedAllowlist.length > 0 ? 1 : 0;

  return {
    issues,
    errors: [
      ...unallowlistedErrors,
      ...unmatchedAllowlist.map((entry) => ({
        cardId: entry.cardId,
        cardName: "(allowlist)",
        jsonPath: "cards/keyword-gate-allowlist.json",
        kind: "error" as const,
        message: `allowlist entry for card ${entry.cardId} keyword "${entry.keyword}" no longer reproduces — remove it after fixing the debt`,
        rawKeyword: entry.keyword,
      })),
    ],
    warnings,
    census: {
      canonical,
      nonCanonical,
      singletons,
      entriesWithNoName,
    },
    exitCode,
  };
}
