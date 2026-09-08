/**
 * Reconcile danglingPendingAudit.ts with a fresh measurement.
 *
 * Usage (after measure-dangling-pending.ts for both configs):
 *   npx tsx scripts/measure-dangling-pending.ts vitest.config.ts > /tmp/main-dangling.json
 *   npx tsx scripts/measure-dangling-pending.ts vitest.audit.config.ts > /tmp/audit-dangling.json
 *   npx tsx scripts/regenerate-dangling-audit.ts /tmp/main-dangling.json /tmp/audit-dangling.json
 *
 * What this script CAN do:
 *   - Update row order/ids to match a new measurement
 *   - Upgrade testName keys when suite paths change but the leaf title still matches
 *     exactly one existing row in the same file
 *
 * What it CANNOT do (by design — exits non-zero):
 *   - Classify a newly dangling test: unmatched measured keys are printed and the run aborts
 *   - Auto-allowlist via ambiguous leaf match: leaf fallback requires exactly one existing
 *     row in the same file; zero or multiple leaf matches abort instead of guessing
 *   - Reuse one audit row for two measured tests: each existing row is claimed at most once
 *   - Preserve (B) rows in output: measured keys classified (B) abort the run
 *
 * Leaf fallback exists only for suite-path renames: when fullTestName changes but the leaf
 * title still maps to exactly one row in that file, the measured key is upgraded.
 *
 * New dangling tests must be classified by hand in danglingPendingAudit.ts before this script
 * will succeed. Until then, strictChooseGate fails closed via chooseStrictModeFailed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { DANGLING_PENDING_AUDIT } from "../tests/harness/danglingPendingAudit.ts";
import type { DanglingPendingAuditEntry } from "../tests/harness/danglingPendingAudit.ts";
import {
  auditEntryKey,
  findExistingAuditRow,
  leaf,
} from "./lib/regenerateDanglingAuditMatch.ts";

const mainPath = process.argv[2] ?? "/tmp/main-dangling-full.json";
const auditMeasurePath = process.argv[3] ?? "/tmp/audit-dangling-full.json";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatEntry(entry: DanglingPendingAuditEntry, id: number): string {
  const q = (s: string) =>
    s.includes("\n") ? `\n      "${esc(s)}"` : `"${esc(s)}"`;
  return `  {
    id: ${id},
    file: "${entry.file}",
    testName: ${q(entry.testName)},
    classification: "${entry.classification}",
    reason: ${q(entry.reason)},
    unresolvedClause: ${entry.unresolvedClause === null ? "null" : `"${esc(entry.unresolvedClause)}"`},
    assertionsWouldStillPass: ${entry.assertionsWouldStillPass === null ? "null" : String(entry.assertionsWouldStillPass)},
    finding: ${entry.finding === null ? "null" : `"${esc(entry.finding)}"`},
  }`;
}

const main = JSON.parse(readFileSync(mainPath, "utf8")) as Array<{
  file: string;
  testName: string;
}>;
const auditMeasure = JSON.parse(
  readFileSync(auditMeasurePath, "utf8"),
) as Array<{
  file: string;
  testName: string;
}>;
const measured = [...main, ...auditMeasure];

const unmatched: string[] = [];
const classifiedB: string[] = [];
const output: DanglingPendingAuditEntry[] = [];
const consumed = new Set<string>();

for (const { file, testName } of measured) {
  const row = findExistingAuditRow(
    file,
    testName,
    DANGLING_PENDING_AUDIT,
    consumed,
  );
  const key = `${file} :: ${testName}`;
  if (!row) {
    unmatched.push(key);
    continue;
  }
  if (row.classification === "B") {
    classifiedB.push(key);
    continue;
  }
  consumed.add(auditEntryKey(row));
  output.push({ ...row, testName });
}

if (unmatched.length > 0 || classifiedB.length > 0) {
  if (unmatched.length > 0) {
    console.error(
      "Refusing to regenerate: measured dangling tests with no classified audit row:",
    );
    for (const key of unmatched) console.error(`  - ${key}`);
    console.error(
      "Add (A) or (B) rows to tests/harness/danglingPendingAudit.ts by hand, then re-run.",
    );
  }
  if (classifiedB.length > 0) {
    console.error(
      "Refusing to regenerate: measured tests still classified (B) in the audit file:",
    );
    for (const key of classifiedB) console.error(`  - ${key}`);
    console.error(
      "Fix the test (resolve the prompt) or reclassify before re-run.",
    );
  }
  process.exit(1);
}

const measuredKeys = new Set(measured.map((m) => `${m.file}::${m.testName}`));
const stale = DANGLING_PENDING_AUDIT.filter(
  (e) =>
    e.classification === "A" &&
    !measuredKeys.has(`${e.file}::${e.testName}`) &&
    !measured.some(
      (m) => m.file === e.file && leaf(m.testName) === leaf(e.testName),
    ),
);

const out = `/**
 * Audit of tests that end with \`state.pendingTargetEffect\` still set.
 *
 * Measured via scripts/measure-dangling-pending.ts (keys use task.fullTestName):
 *   vitest.config.ts: ${main.length} test ends
 *   vitest.audit.config.ts: ${auditMeasure.length} additional test ends
 *   Combined allowlist keys (classification A only): ${output.length}
 *
 * Classifications:
 *   A — Prompt-is-the-subject. Allowlisted by strictChooseGate.
 *   B — Silently unresolved. Never allowlisted — fix the test, then remove the row.
 *
 * Maintenance: scripts/regenerate-dangling-audit.ts reconciles with a new measurement
 * but refuses to invent classifications. New danglers must be added by hand.
 *
 * Keys: file + fullTestName. Renaming an allowlisted test fails the gate (safe).
 */

export type DanglingPendingClassification = "A" | "B";

export interface DanglingPendingAuditEntry {
  id: number;
  file: string;
  testName: string;
  classification: DanglingPendingClassification;
  reason: string;
  unresolvedClause: string | null;
  assertionsWouldStillPass: boolean | null;
  finding: string | null;
}

export const DANGLING_PENDING_AUDIT: readonly DanglingPendingAuditEntry[] = [
${output.map((e, i) => formatEntry(e, i + 1)).join(",\n")},
];

export const DANGLING_PENDING_SUMMARY = {
  measuredTotal: DANGLING_PENDING_AUDIT.length,
  classificationA: DANGLING_PENDING_AUDIT.filter(
    (e) => e.classification === "A",
  ).length,
  classificationB: DANGLING_PENDING_AUDIT.filter(
    (e) => e.classification === "B",
  ).length,
} as const;

export const SILENTLY_UNRESOLVED = DANGLING_PENDING_AUDIT.filter(
  (e) => e.classification === "B",
);
`;

writeFileSync("tests/harness/danglingPendingAudit.ts", out);
console.log(
  `wrote ${output.length} (A) entries to tests/harness/danglingPendingAudit.ts`,
);
if (stale.length > 0) {
  console.warn(
    `Note: ${stale.length} existing (A) row(s) not in this measurement (stale until removed):`,
  );
  for (const row of stale) {
    console.warn(`  - ${row.file} :: ${row.testName}`);
  }
}
