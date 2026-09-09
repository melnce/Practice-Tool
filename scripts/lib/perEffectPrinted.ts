/**
 * Per-effect `printed` literals on card-data op objects (phase 1).
 *
 * Naming note: `scripts/check-printed-literals.ts` uses `const printed` in **test**
 * files pinned against the whole-card `description`. This module validates the
 * optional per-op `printed` string field on card JSON — same word, two mechanisms.
 */

import { collectOpsInTree } from "../op-keys-gate.js";
import type { CardJson } from "./loadCards.js";

/** Reused from check-printed-literals.ts — card data does not use ` / ` separators. */
function normalizeSeparators(text: string): string {
  return text.replace(/ \/ /g, "\n");
}

export type PerEffectPrintedIssue = {
  id: string;
  name: string;
  kind: "error";
  rule: "verbatim" | "clause_root_only" | "overlapping_claim";
  message: string;
};

export type ClauseRootSite = {
  path: string;
  eff: Record<string, unknown>;
};

const KEYWORD_LINE_RE =
  /^(Fanfare|Ward|Rush|Storm|Bane|Barrier|Aura|Intimidate|Last Words|Super-Evolve|Enhance(?: \(\d+\))?|Accelerate(?: \(\d+\))?|Crystallize(?: \(\d+\))?|Engage|Evolve|Countdown(?: \(\d+\))?)\s*:?\s*(.*)$/i;

const KEYWORD_ONLY_LINE_RE =
  /^(ward|storm|rush|bane|drain|ambush|intimidation|aura|barrier)\b/i;

/**
 * Permanent property lines on card descriptions — not effects, not bare keywords.
 * Enumerated (not pattern-matched); pin in tests/mechanics/per-effect-printed.test.ts.
 */
export const STATIC_ABILITY_LINES = [
  "Can attack 2 times per turn.",
  "Can attack 3 times per turn.",
  "Can't attack followers or leaders.",
  "Can't be destroyed by abilities.",
  "Can't be played.",
  "Can't take more than 3 damage at a time.",
  "Ignores Ward.",
] as const;

const STATIC_ABILITY_LINE_SET = new Set<string>(STATIC_ABILITY_LINES);

/** Reused from check-printed-literals.ts: separator normalisation only (card data has no annotations). */
export function normalizePrintedForCompare(text: string): string {
  const withSeparators = normalizeSeparators(text);
  return withSeparators.replace(/\s+/g, " ").trim();
}

export function isBareKeywordLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (STATIC_ABILITY_LINE_SET.has(t)) return true;
  if (KEYWORD_ONLY_LINE_RE.test(t)) return true;
  const kwMatch = t.match(KEYWORD_LINE_RE);
  if (!kwMatch) return false;
  return (kwMatch[2] ?? "").trim().length === 0;
}

export function splitDescriptionLines(description: string): string[] {
  return description
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitNonKeywordLines(description: string): string[] {
  return splitDescriptionLines(description).filter(
    (line) => !isBareKeywordLine(line),
  );
}

/**
 * Sentence boundaries: newline-separated non-bare-keyword lines, then `. ` / `! ` / `? `
 * splits within a line (same idea as the free-slice census).
 */
export function splitNonKeywordSentences(description: string): string[] {
  const sentences: string[] = [];
  for (const line of splitNonKeywordLines(description)) {
    const parts = line
      .split(/(?<=[.!?])\s+(?=[A-Z"(])/)
      .map((s) => s.trim())
      .filter(Boolean);
    sentences.push(...parts);
  }
  return sentences;
}

/** Ops with no op ancestor in the card JSON tree — clause roots only. */
export function collectClauseRoots(card: CardJson): ClauseRootSite[] {
  const roots: ClauseRootSite[] = [];

  function walk(node: unknown, pathStr: string, insideOp: boolean): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${pathStr}[${i}]`, insideOp));
      return;
    }
    const obj = node as Record<string, unknown>;
    let childInsideOp = insideOp;
    if (typeof obj.op === "string") {
      if (!insideOp) roots.push({ path: pathStr, eff: obj });
      childInsideOp = true;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === "op") continue;
      walk(v, `${pathStr}.${k}`, childInsideOp);
    }
  }

  walk(card, card.id, false);
  return roots;
}

export function isFreeSliceCard(card: CardJson): boolean {
  const roots = collectClauseRoots(card);
  if (roots.length !== 1) return false;
  return splitNonKeywordSentences(card.description ?? "").length === 1;
}

/** Printed literal for the unambiguous one-root / one-sentence slice. */
export function freeSlicePrintedLiteral(card: CardJson): string | null {
  if (!isFreeSliceCard(card)) return null;
  const lines = splitNonKeywordLines(card.description ?? "");
  if (lines.length === 1) return lines[0]!;
  const sentences = splitNonKeywordSentences(card.description ?? "");
  return sentences[0] ?? null;
}

/** Effect lines: description lines that are neither bare keywords nor static abilities. */
export function effectDescriptionLines(description: string): string[] {
  return splitDescriptionLines(description).filter(
    (line) => !isBareKeywordLine(line),
  );
}

/** True when every effect line forms one contiguous block (no non-effect line between). */
export function hasContiguousEffectSpan(description: string): boolean {
  const lines = splitDescriptionLines(description);
  const effectIndices = lines
    .map((line, i) => (isBareKeywordLine(line) ? -1 : i))
    .filter((i) => i >= 0);
  if (effectIndices.length === 0) return false;
  const min = effectIndices[0]!;
  const max = effectIndices[effectIndices.length - 1]!;
  for (let i = min; i <= max; i++) {
    if (isBareKeywordLine(lines[i]!)) return false;
  }
  return true;
}

/** Contiguous verbatim span of effect lines (newline-joined), or null if non-contiguous. */
export function contiguousEffectSpanLiteral(
  description: string,
): string | null {
  const lines = splitDescriptionLines(description);
  const effectIndices = lines
    .map((line, i) => (isBareKeywordLine(line) ? -1 : i))
    .filter((i) => i >= 0);
  if (effectIndices.length === 0) return null;
  const min = effectIndices[0]!;
  const max = effectIndices[effectIndices.length - 1]!;
  for (let i = min; i <= max; i++) {
    if (isBareKeywordLine(lines[i]!)) return null;
  }
  return lines.slice(min, max + 1).join("\n");
}

/** One clause root with no populated `printed` yet. */
export function isSingleRootUnprintedCard(card: CardJson): boolean {
  const roots = collectClauseRoots(card);
  if (roots.length !== 1) return false;
  const printed = roots[0]!.eff.printed;
  return !(typeof printed === "string" && printed.length > 0);
}

/**
 * Phase 2a — mechanical `printed` for exactly-one-root cards: the contiguous
 * span of effect lines (description minus leading/trailing non-effect lines).
 */
export function singleRootPrintedLiteral(card: CardJson): string | null {
  if (!isSingleRootUnprintedCard(card)) return null;
  const description = card.description ?? "";
  if (isFreeSliceCard(card)) return freeSlicePrintedLiteral(card);
  if (!hasContiguousEffectSpan(description)) return null;
  return contiguousEffectSpanLiteral(description);
}

export function findSubstringSpan(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  return { start: idx, end: idx + needle.length };
}

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

export type PerEffectPrintedGateOptions = {
  /** When true, skip all validation (neuter tests). */
  disabled?: boolean;
};

export function checkPerEffectPrintedForCard(
  card: CardJson,
  options?: PerEffectPrintedGateOptions,
): PerEffectPrintedIssue[] {
  if (options?.disabled) return [];

  const issues: PerEffectPrintedIssue[] = [];
  const description = card.description ?? "";
  const normalizedDesc = normalizePrintedForCompare(description);

  const roots = collectClauseRoots(card);
  const rootByPath = new Map(roots.map((r) => [r.path, r]));

  const allOps: { path: string; eff: Record<string, unknown> }[] = [];
  collectOpsInTree(card, card.id, allOps);

  const claims: { path: string; span: { start: number; end: number } }[] = [];

  for (const { path: opPath, eff } of allOps) {
    const printed = eff.printed;
    if (printed === undefined) continue;

    if (typeof printed !== "string") {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        rule: "verbatim",
        message: `${opPath}: printed must be a string`,
      });
      continue;
    }

    if (!rootByPath.has(opPath)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        rule: "clause_root_only",
        message: `${opPath}: printed is only allowed on clause roots (op has an op ancestor)`,
      });
      continue;
    }

    const normalizedPrinted = normalizePrintedForCompare(printed);
    if (!normalizedPrinted) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        rule: "verbatim",
        message: `${opPath}: printed is empty after whitespace normalisation`,
      });
      continue;
    }

    const span = findSubstringSpan(normalizedDesc, normalizedPrinted);
    if (!span) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        rule: "verbatim",
        message: `${opPath}: printed is not a verbatim substring of the card description after whitespace normalisation`,
      });
      continue;
    }

    claims.push({ path: opPath, span });
  }

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;
      if (spansOverlap(a.span, b.span)) {
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          rule: "overlapping_claim",
          message: `${a.path} and ${b.path}: printed claims overlap in the card description`,
        });
      }
    }
  }

  return issues;
}

export type PrintedCoverageStats = {
  clauseRoots: number;
  populated: number;
  cardsWithPrinted: number;
};

export function measurePrintedCoverage(
  cards: Iterable<CardJson>,
): PrintedCoverageStats {
  let clauseRoots = 0;
  let populated = 0;
  const cardsWithPrinted = new Set<string>();

  for (const card of cards) {
    const roots = collectClauseRoots(card);
    clauseRoots += roots.length;
    for (const { eff } of roots) {
      if (typeof eff.printed === "string" && eff.printed.length > 0) {
        populated++;
        cardsWithPrinted.add(card.id);
      }
    }
  }

  return {
    clauseRoots,
    populated,
    cardsWithPrinted: cardsWithPrinted.size,
  };
}
