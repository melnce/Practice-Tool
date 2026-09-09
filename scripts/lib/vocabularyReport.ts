/**
 * Exhaustive vocabulary report — every op key seen in card data.
 */

import { OP_TOP_LEVEL_KEYS } from "../op-keys-gate.js";
import { collectOpsInTree } from "../op-keys-gate.js";
import {
  loadUniqueCardsById,
  isTokenEntry,
  type CardDataEntry,
} from "./loadAllCardData.js";
import {
  registryDocumentedTopLevelKeys,
  VOCABULARY_RULES,
  conditionalDocumentedTopLevelKey,
  CONDITIONAL_DOCUMENTED_TOP_LEVEL_KEYS,
  type ConditionalDocumentedKey,
} from "./vocabularyRegistry.js";

export type KeyCount = {
  key: string;
  collectible: number;
  token: number;
  total: number;
};

export type OpKeyReport = {
  op: string;
  keys: KeyCount[];
  undocumented: string[];
};

export type VocabularyReport = {
  generatedAt: string;
  ops: OpKeyReport[];
  undocumentedSummary: Array<{ op: string; key: string; total: number }>;
};

function collectTopLevelKeys(
  eff: Record<string, unknown>,
  op: string,
  counts: Map<string, { collectible: number; token: number }>,
  isToken: boolean,
): void {
  const allowed = OP_TOP_LEVEL_KEYS[op];
  if (!allowed) return;
  for (const key of Object.keys(eff)) {
    if (key === "op") continue;
    const entry = counts.get(key) ?? { collectible: 0, token: 0 };
    if (isToken) entry.token++;
    else entry.collectible++;
    counts.set(key, entry);
  }
}

export function buildVocabularyReport(
  entries: Iterable<CardDataEntry> = loadUniqueCardsById().values(),
  conditionalKeys: ConditionalDocumentedKey[] | "default" = "default",
): VocabularyReport {
  const byOp = new Map<
    string,
    Map<string, { collectible: number; token: number }>
  >();

  for (const entry of entries) {
    const { card } = entry;
    const isToken = isTokenEntry(entry);
    const found: { path: string; eff: Record<string, unknown> }[] = [];
    collectOpsInTree(card, card.id, found);
    for (const { eff } of found) {
      const op = String(eff.op);
      if (!byOp.has(op)) byOp.set(op, new Map());
      collectTopLevelKeys(eff, op, byOp.get(op)!, isToken);
    }
  }

  const documented = registryDocumentedTopLevelKeys();
  for (const rule of VOCABULARY_RULES) {
    for (const matcher of rule.rejected) {
      if (matcher.kind === "top-level") documented.add(matcher.key);
    }
  }
  const resolvedConditionalKeys =
    conditionalKeys === "default"
      ? CONDITIONAL_DOCUMENTED_TOP_LEVEL_KEYS
      : conditionalKeys;

  const ops: OpKeyReport[] = [];
  const undocumentedSummary: Array<{ op: string; key: string; total: number }> =
    [];

  for (const [op, keyMap] of [...byOp.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const allowed = OP_TOP_LEVEL_KEYS[op] ?? new Set<string>();
    const keys: KeyCount[] = [];
    const undocumented: string[] = [];

    for (const [key, counts] of [...keyMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const total = counts.collectible + counts.token;
      keys.push({
        key,
        collectible: counts.collectible,
        token: counts.token,
        total,
      });
      const conditionalDoc = conditionalDocumentedTopLevelKey(
        op,
        key,
        resolvedConditionalKeys,
      );
      if (!allowed.has(key) && !documented.has(key) && !conditionalDoc) {
        undocumented.push(key);
        undocumentedSummary.push({ op, key, total });
      }
    }

    ops.push({ op, keys, undocumented });
  }

  undocumentedSummary.sort(
    (a, b) => b.total - a.total || a.op.localeCompare(b.op),
  );

  return {
    generatedAt: new Date().toISOString(),
    ops,
    undocumentedSummary,
  };
}

export function formatVocabularyReport(report: VocabularyReport): string {
  const lines: string[] = [
    `# Vocabulary report`,
    `generated: ${report.generatedAt}`,
    "",
  ];

  for (const { op, keys, undocumented } of report.ops) {
    lines.push(`## op:${op}`);
    for (const k of keys) {
      lines.push(
        `  ${k.key}: total=${k.total} (collectible=${k.collectible}, token=${k.token})`,
      );
    }
    if (undocumented.length) {
      lines.push(`  UNDOCUMENTED: ${undocumented.join(", ")}`);
    }
    lines.push("");
  }

  if (report.undocumentedSummary.length) {
    lines.push("## undocumented summary");
    for (const row of report.undocumentedSummary) {
      lines.push(`  ${row.op}.${row.key}: ${row.total}`);
    }
  } else {
    lines.push("## undocumented summary");
    lines.push("  (none)");
  }

  lines.push("");
  lines.push("## conditional keys");
  for (const doc of CONDITIONAL_DOCUMENTED_TOP_LEVEL_KEYS) {
    lines.push(`  ${doc.op}.${doc.key}: when ${doc.condition} — ${doc.reason}`);
  }

  return lines.join("\n");
}
