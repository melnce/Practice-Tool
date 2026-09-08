/**
 * Reconcile unconsumedCommandsAudit.ts with a fresh measurement.
 *
 * Usage (after measure-unconsumed-commands.ts for both configs):
 *   npx tsx scripts/measure-unconsumed-commands.ts vitest.config.ts > /tmp/main-unconsumed.json
 *   npx tsx scripts/measure-unconsumed-commands.ts vitest.audit.config.ts > /tmp/audit-unconsumed.json
 *   npx tsx scripts/regenerate-unconsumed-commands-audit.ts /tmp/main-unconsumed.json /tmp/audit-unconsumed.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { UNCONSUMED_COMMANDS_AUDIT } from "../tests/harness/unconsumedCommandsAudit.ts";
import type { UnconsumedCommandAuditEntry } from "../tests/harness/unconsumedCommandsAudit.ts";
import {
  auditEntryKey,
  findExistingAuditRow,
} from "./lib/regenerateDanglingAuditMatch.ts";

const mainPath = process.argv[2] ?? "/tmp/main-unconsumed.json";
const auditMeasurePath = process.argv[3] ?? "/tmp/audit-unconsumed.json";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatEntry(entry: UnconsumedCommandAuditEntry, id: number): string {
  const q = (s: string) =>
    s.includes("\n") ? `\n      "${esc(s)}"` : `"${esc(s)}"`;
  return `  {
    id: ${id},
    file: "${entry.file}",
    testName: ${q(entry.testName)},
    classification: "${entry.classification}",
    reason: ${q(entry.reason)},
    uid: ${entry.uid === null ? "null" : `"${esc(entry.uid)}"`},
  }`;
}

type MeasuredRow = { file: string; testName: string; uid?: string };

function aggregate(rows: MeasuredRow[]): Map<string, MeasuredRow> {
  const byTest = new Map<string, MeasuredRow>();
  for (const row of rows) {
    const key = `${row.file}::${row.testName}`;
    if (!byTest.has(key)) byTest.set(key, row);
  }
  return byTest;
}

const main = JSON.parse(readFileSync(mainPath, "utf8")) as MeasuredRow[];
const auditMeasure = JSON.parse(
  readFileSync(auditMeasurePath, "utf8"),
) as MeasuredRow[];
const measured = aggregate([...main, ...auditMeasure]);

const unmatched: string[] = [];
const classifiedB: string[] = [];
const output: UnconsumedCommandAuditEntry[] = [];
const consumed = new Set<string>();

for (const [key, row] of measured) {
  const auditRow = findExistingAuditRow(
    row.file,
    row.testName,
    UNCONSUMED_COMMANDS_AUDIT,
    consumed,
  );
  if (!auditRow) {
    unmatched.push(key);
    continue;
  }
  if (auditRow.classification === "B") {
    classifiedB.push(key);
    continue;
  }
  consumed.add(auditEntryKey(auditRow));
  output.push({
    ...auditRow,
    testName: row.testName,
    uid: row.uid ?? auditRow.uid,
  });
}

if (unmatched.length > 0 || classifiedB.length > 0) {
  if (unmatched.length > 0) {
    console.error(
      "Refusing to regenerate: measured no-prompt tests with no classified audit row:",
    );
    for (const key of unmatched) console.error(`  - ${key}`);
  }
  if (classifiedB.length > 0) {
    console.error(
      "Refusing to regenerate: measured tests still classified (B):",
    );
    for (const key of classifiedB) console.error(`  - ${key}`);
  }
  process.exit(1);
}

const out = `/**
 * Audit of resolvePendingTarget calls with no prompt open (exit 1).
 *
 * Measured via scripts/measure-unconsumed-commands.ts (keys use task.fullTestName):
 *   vitest.config.ts: ${main.length} call rows
 *   vitest.audit.config.ts: ${auditMeasure.length} additional rows
 *   Combined allowlist keys (classification A only): ${output.length}
 *
 * Classifications:
 *   A — Legitimate no-op or replay artifact. Allowlisted by assertAllCommandsUsedAfterTest.
 *   B — Silently unresolved. Never allowlisted — fix the test, then remove the row.
 */

export type UnconsumedCommandClassification = "A" | "B";

export interface UnconsumedCommandAuditEntry {
  id: number;
  file: string;
  testName: string;
  classification: UnconsumedCommandClassification;
  reason: string;
  uid: string | null;
}

export const UNCONSUMED_COMMANDS_AUDIT: readonly UnconsumedCommandAuditEntry[] = [
${output.map((e, i) => formatEntry(e, i + 1)).join(",\n")},
];

export const UNCONSUMED_COMMANDS_SUMMARY = {
  measuredTotal: UNCONSUMED_COMMANDS_AUDIT.length,
  classificationA: UNCONSUMED_COMMANDS_AUDIT.filter(
    (e) => e.classification === "A",
  ).length,
  classificationB: UNCONSUMED_COMMANDS_AUDIT.filter(
    (e) => e.classification === "B",
  ).length,
} as const;
`;

writeFileSync("tests/harness/unconsumedCommandsAudit.ts", out);
console.log(
  `wrote ${output.length} (A) entries to tests/harness/unconsumedCommandsAudit.ts`,
);
