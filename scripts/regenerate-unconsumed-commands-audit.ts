/**
 * Reconcile unconsumedCommandsAudit.ts with a fresh measurement.
 *
 * Usage (after measure-unconsumed-commands.ts for both configs):
 *   npx tsx scripts/measure-unconsumed-commands.ts vitest.config.ts > /tmp/main-unconsumed.json
 *   npx tsx scripts/measure-unconsumed-commands.ts vitest.audit.config.ts > /tmp/audit-unconsumed.json
 *   npx tsx scripts/regenerate-unconsumed-commands-audit.ts /tmp/main-unconsumed.json /tmp/audit-unconsumed.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  UNCONSUMED_COMMANDS_AUDIT,
  UNCONSUMED_COMMANDS_SUMMARY,
} from "../tests/harness/unconsumedCommandsAudit.ts";
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
const allMeasuredRows = [...main, ...auditMeasure];
const measured = aggregate(allMeasuredRows);

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
 * Measured on origin/main (2026-09-08) via resolveTargetProbe + afterEach in
 * tests/fixtures/setup.ts (keys use task.fullTestName when present):
 *   Before gate: 31 no-prompt calls across 25 tests in 17 files
 *     (vitest.config.ts + vitest.audit.config.ts — audit config shares setup.ts,
 *      so the afterEach gate runs there too; npm run check runs test:audit before test)
 *   After gate + mechanics (B) fixes: ${allMeasuredRows.length} calls covered by ${output.length} (A) rows below;
 *     ${UNCONSUMED_COMMANDS_SUMMARY.classificationB} (B) sites fixed by removing the dead resolvePendingTarget call
 *
 * Classifications:
 *   A — No-op is legitimate or is itself the subject (soak replay, L2 harness idempotency, etc.)
 *   B — Test meant to resolve a prompt that never opened (fixed in mechanics files; not listed)
 *
 * Maintenance: scripts/regenerate-unconsumed-commands-audit.ts reconciles with a new
 * measurement but refuses to invent classifications.
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
  measuredTotal: ${allMeasuredRows.length},
  measuredTests: ${measured.size},
  classificationA: UNCONSUMED_COMMANDS_AUDIT.length,
  classificationB: ${UNCONSUMED_COMMANDS_SUMMARY.classificationB},
} as const;
`;

writeFileSync("tests/harness/unconsumedCommandsAudit.ts", out);
console.log(
  `wrote ${output.length} (A) entries to tests/harness/unconsumedCommandsAudit.ts`,
);
