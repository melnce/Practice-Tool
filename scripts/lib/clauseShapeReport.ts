/**
 * Clause ↔ op-shape consistency report (warning-level, heuristic).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectOpsInTree } from "../op-keys-gate.js";
import { loadUniqueCardsById, type CardDataEntry } from "./loadAllCardData.js";
import type { CardJson } from "./loadCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..", "..");

export const CLAUSE_SHAPE_EXCEPTIONS_PATH = path.join(
  ROOT,
  "cards",
  "clause-shape-known-exceptions.json",
);

export type ClauseShapeException = {
  clause: string;
  reason: string;
};

export type EffectSite = {
  cardId: string;
  cardName: string;
  sitePath: string;
  clause: string;
  signature: string;
};

export type MultiShapeClause = {
  clause: string;
  signatures: string[];
  sites: EffectSite[];
};

export type ClauseShapeReport = {
  generatedAt: string;
  multiShapeClauses: MultiShapeClause[];
  knownExceptions: ClauseShapeException[];
  flagged: MultiShapeClause[];
};

function normalizeClause(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
}

export function splitDescriptionClauses(description: string): string[] {
  return description
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function timingKeywordForPath(pathStr: string): RegExp | null {
  if (pathStr.includes(".fanfare")) return /\bfanfare\b/i;
  if (pathStr.includes(".evolve")) return /\bevolve\b/i;
  if (pathStr.includes(".superevolve")) return /\bsuper-evolve\b/i;
  if (pathStr.includes(".spell")) return /\bfanfare\b/i;
  if (pathStr.includes(".triggers[")) return null;
  if (pathStr.includes(".keywords[")) {
    return /\b(last words|engage|enhance|countdown|accelerate|crystallize)\b/i;
  }
  return null;
}

export function assignClauseLabel(card: CardJson, opPath: string): string {
  const clauses = splitDescriptionClauses(card.description ?? "");
  const timingRe = timingKeywordForPath(opPath);

  if (timingRe) {
    for (const clause of clauses) {
      if (timingRe.test(clause)) return normalizeClause(clause);
    }
  }

  if (clauses.length === 1) return normalizeClause(clauses[0]!);

  const bucket = opPath.split(".")[1] ?? "effect";
  const idx = (() => {
    const m = opPath.match(/\[(\d+)\]/);
    return m ? Number(m[1]) : 0;
  })();
  const clause = clauses[Math.min(idx, clauses.length - 1)] ?? clauses[0] ?? "";
  return normalizeClause(`${bucket}:${clause}`);
}

function abstractValue(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return "#";
  if (typeof value === "string") return '"…"';
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[${value.map(abstractValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${k}:${abstractValue(obj[k])}`).join(",")}}`;
  }
  return "?";
}

export function computeOpShapeSignature(eff: Record<string, unknown>): string {
  const parts: string[] = [`op=${eff.op}`];

  const structural = [
    "action",
    "distribution",
    "source",
    "target",
    "select",
    "mode",
  ] as const;
  for (const key of structural) {
    if (eff[key] !== undefined) parts.push(`${key}=${abstractValue(eff[key])}`);
  }

  for (const nest of ["filter", "condition", "then", "keywords"] as const) {
    const val = eff[nest];
    if (val === undefined) continue;
    if (typeof val === "string") {
      parts.push(`${nest}="${val}"`);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      parts.push(
        `${nest}.keys=${Object.keys(val as object)
          .sort()
          .join(",")}`,
      );
    } else {
      parts.push(`${nest}=${abstractValue(val)}`);
    }
  }

  return parts.join("|");
}

export function loadClauseShapeExceptions(): ClauseShapeException[] {
  if (!fs.existsSync(CLAUSE_SHAPE_EXCEPTIONS_PATH)) return [];
  const raw = JSON.parse(
    fs.readFileSync(CLAUSE_SHAPE_EXCEPTIONS_PATH, "utf-8"),
  );
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ClauseShapeException =>
      e != null &&
      typeof e === "object" &&
      typeof e.clause === "string" &&
      typeof e.reason === "string",
  );
}

export function buildClauseShapeReport(
  entries: Map<string, CardDataEntry> = loadUniqueCardsById(),
): ClauseShapeReport {
  const byClause = new Map<string, EffectSite[]>();
  const knownExceptions = loadClauseShapeExceptions();
  const excepted = new Set(knownExceptions.map((e) => e.clause));

  for (const { card } of entries.values()) {
    const found: { path: string; eff: Record<string, unknown> }[] = [];
    collectOpsInTree(card, card.id, found);
    for (const { path: opPath, eff } of found) {
      const clause = assignClauseLabel(card, opPath);
      const site: EffectSite = {
        cardId: card.id,
        cardName: card.name,
        sitePath: opPath,
        clause,
        signature: computeOpShapeSignature(eff),
      };
      const list = byClause.get(clause) ?? [];
      list.push(site);
      byClause.set(clause, list);
    }
  }

  const multiShapeClauses: MultiShapeClause[] = [];
  for (const [clause, sites] of byClause.entries()) {
    const signatures = [...new Set(sites.map((s) => s.signature))].sort();
    if (signatures.length > 1) {
      multiShapeClauses.push({ clause, signatures, sites });
    }
  }

  multiShapeClauses.sort((a, b) => a.clause.localeCompare(b.clause));

  const flagged = multiShapeClauses.filter((m) => !excepted.has(m.clause));

  return {
    generatedAt: new Date().toISOString(),
    multiShapeClauses,
    knownExceptions,
    flagged,
  };
}

export function formatClauseShapeReport(report: ClauseShapeReport): string {
  const lines: string[] = [
    `# Clause-shape report`,
    `generated: ${report.generatedAt}`,
    `multi-shape clauses: ${report.multiShapeClauses.length}`,
    `flagged (not in known-exceptions): ${report.flagged.length}`,
    "",
  ];

  for (const entry of report.multiShapeClauses) {
    const excepted = report.knownExceptions.some(
      (e) => e.clause === entry.clause,
    );
    lines.push(`## ${entry.clause}${excepted ? " [known-exception]" : ""}`);
    lines.push(`signatures (${entry.signatures.length}):`);
    for (const sig of entry.signatures) {
      lines.push(`  - ${sig}`);
    }
    lines.push(`sites: ${entry.sites.length}`);
    lines.push("");
  }

  return lines.join("\n");
}
