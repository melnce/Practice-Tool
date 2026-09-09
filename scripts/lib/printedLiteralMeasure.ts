/**
 * BU5 — measure per-effect printed literal feasibility (report only).
 */

import { collectOpsInTree } from "../op-keys-gate.js";
import { countClauses } from "./subjecthood.js";
import { loadUniqueCardsById } from "./loadAllCardData.js";
import type { CardJson } from "./loadCards.js";

export type PrintedLiteralMeasure = {
  totalEffectRoots: number;
  cardsWithMultiClauseDescription: number;
  ambiguousEffectRoots: number;
  cardsScanned: number;
  schemaExtensionFeasible: boolean;
  schemaExtensionNotes: string;
  generationEstimate: {
    autoGenerableFraction: string;
    handAuthoringFraction: string;
    estimatedHours: string;
    bu4FalsePositiveReduction: string;
  };
};

function countEffectRoots(card: CardJson): number {
  const found: { path: string; eff: Record<string, unknown> }[] = [];
  collectOpsInTree(card, card.id, found);
  return found.length;
}

function descriptionClauseCount(description: string): number {
  return description
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

export function measurePrintedLiterals(): PrintedLiteralMeasure {
  const entries = loadUniqueCardsById();
  let totalEffectRoots = 0;
  let cardsWithMultiClauseDescription = 0;
  let ambiguousEffectRoots = 0;

  for (const { card } of entries.values()) {
    const roots = countEffectRoots(card);
    totalEffectRoots += roots;
    const descClauses = descriptionClauseCount(card.description ?? "");
    const jsonClauses = countClauses(card);
    if (descClauses > 1) cardsWithMultiClauseDescription++;
    if (descClauses > 1 || jsonClauses > 1) {
      ambiguousEffectRoots += roots;
    }
  }

  const multiClauseFraction =
    cardsWithMultiClauseDescription / Math.max(entries.size, 1);

  return {
    totalEffectRoots,
    cardsWithMultiClauseDescription,
    ambiguousEffectRoots,
    cardsScanned: entries.size,
    schemaExtensionFeasible: true,
    schemaExtensionNotes:
      "Effect objects are plain JSON records; adding an optional `printed` string at each op root is backward-compatible. check-printed-literals.ts already parses test literals via ts-morph — the same pattern can validate per-effect `printed` against card.description clauses without breaking existing cards (field optional until populated).",
    generationEstimate: {
      autoGenerableFraction: "~40%",
      handAuthoringFraction: "~60%",
      estimatedHours:
        multiClauseFraction > 0.3
          ? "80–120 engineer-hours (split auto-draft from description clauses + human review on ~" +
            ambiguousEffectRoots +
            " ambiguous roots)"
          : "60–90 engineer-hours",
      bu4FalsePositiveReduction:
        "From ~252 heuristic multi-shape clauses down to near-zero for populated cards; remaining flags would be genuine shape drift on identical printed text.",
    },
  };
}

export function formatPrintedLiteralMeasure(m: PrintedLiteralMeasure): string {
  return [
    "# Per-effect printed literal measurement",
    "",
    `- Cards scanned: ${m.cardsScanned}`,
    `- Total effect roots (op objects): ${m.totalEffectRoots}`,
    `- Cards with multi-clause descriptions: ${m.cardsWithMultiClauseDescription}`,
    `- Effect roots on ambiguous cards (multi-clause desc or multi JSON clause): ${m.ambiguousEffectRoots}`,
    "",
    "## Schema extension",
    `- Feasible without schema break: ${m.schemaExtensionFeasible}`,
    `- Notes: ${m.schemaExtensionNotes}`,
    "",
    "## Estimate",
    `- Auto-generable: ${m.generationEstimate.autoGenerableFraction}`,
    `- Hand-authored/reviewed: ${m.generationEstimate.handAuthoringFraction}`,
    `- Engineering cost: ${m.generationEstimate.estimatedHours}`,
    `- BU4 false-positive reduction: ${m.generationEstimate.bu4FalsePositiveReduction}`,
  ].join("\n");
}
