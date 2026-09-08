import { readFileSync, writeFileSync } from "node:fs";

const oldAudit = readFileSync("/tmp/pr344-audit.ts", "utf8");
const main = JSON.parse(
  readFileSync("/tmp/main-dangling-full.json", "utf8"),
) as Array<{ file: string; testName: string }>;
const auditMeasure = JSON.parse(
  readFileSync("/tmp/audit-dangling-full.json", "utf8"),
) as Array<{ file: string; testName: string }>;

const entryRe =
  /file: "([^"]+)",\s*testName:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)",\s*classification: "([AB])",\s*reason:\s*\n?\s*"([^"]*(?:\\.[^"]*)*)"/g;
const reasons = new Map<string, string>();
let m: RegExpExecArray | null;
while ((m = entryRe.exec(oldAudit))) {
  const file = m[1];
  const testName = m[2].replace(/\\"/g, '"');
  const reason = m[3].replace(/\\"/g, '"');
  reasons.set(`${file}::${testName}`, reason);
  const leaf = testName.includes(" > ")
    ? testName.split(" > ").pop()!
    : testName;
  reasons.set(`${file}::leaf::${leaf}`, reason);
}

const auditReasonsByLeaf: Record<string, string> = {
  "10062110 Ironfist Priest — Evolve pool excludes enemies above 3 defense":
    "Asserts evolve selection pool excludes out-of-filter enemies; pending pool is the subject.",
  "10672120 Timid Pioneer — Fanfare pool excludes enemies above 3 defense":
    "Asserts fanfare pool excludes enemies above 3 defense; resolution intentionally omitted.",
  "10862310 Lingering Threat — pool excludes enemies above 3 defense":
    "Asserts spell pool excludes high-defense enemies; pending pool is the subject.",
  "10172320 Doomwright Resurgence — pool is Artifact followers ≤5 only":
    "Asserts hand selection pool is Artifact followers costing ≤5; pending pool is the subject.",
  "10271210 Artifact Catapult — Engage pool is Artifact followers ≤5 only":
    "Asserts Engage hand pool is Artifact followers ≤5; pending pool is the subject.",
  "10572110 New-Age Cartographer — Super-Evolve pool is Artifact followers ≤5 only":
    "Asserts Super-Evolve hand pool is Artifact followers ≤5; pending pool is the subject.",
  "10371120 Supersonic Fighter — Evolve pool is allied Artifact followers only":
    "Asserts evolve pool is allied Artifact followers only; pending pool is the subject.",
  "10332210 Institute of Truth — Engage pool is hand followers only":
    "Asserts Engage hand pool is followers only; pending pool is the subject.",
  "10741120 Carrier Wyvern — Evolve pool is hand followers only":
    "Asserts evolve hand pool is followers only; pending pool is the subject.",
  "10161110 Angelic Prism Priestess — Evolve pool is hand amulets only":
    "Asserts evolve hand pool is amulets only; pending pool is the subject.",
  "10131310 Radiant Rainbow — pool is On Spellboost cards only":
    "Asserts hand pool is On Spellboost cards only; pending pool is the subject.",
  "10521310 Extravagance — pool is hand spells only":
    "Asserts hand pool is spells only; pending pool is the subject.",
  "10262310 Divine Guard — pool is allied followers with Ward only":
    "Asserts pool is allied Ward followers only; pending pool is the subject.",
  "10104110 Olivia — Super-Evolve pool is unevolved allies only (excludes evolved)":
    "Asserts Super-Evolve pool excludes evolved allies; pending pool is the subject.",
  "10472110 Eustace — Skybound Art pool is unevolved allies only":
    "Asserts Skybound Art pool is unevolved allies only; pending pool is the subject.",
  "10874120 Eudie — Evolve pool is unevolved allies only (excludes self)":
    "Asserts evolve pool is unevolved allies excluding self; pending pool is the subject.",
  "10032110 Remi & Rami — Super-Evolve pool is allied Golem followers only":
    "Asserts Super-Evolve pool is allied Golem followers only; pending pool is the subject.",
  "playing opens pending pool with exactly the two enemy followers":
    "Asserts pending pool membership for Alchemic Flare; pool composition is the subject.",
  "pre-fix select_mode leaves pending user selection (fails on main card JSON)":
    "Regression guard: legacy select_mode must leave pending user selection (pre-fix JSON shape).",
};

function reasonFor(file: string, testName: string): string {
  const key = `${file}::${testName}`;
  if (reasons.has(key)) return reasons.get(key)!;
  const leaf = testName.split(" > ").pop() ?? testName;
  if (reasons.has(`${file}::leaf::${leaf}`)) {
    return reasons.get(`${file}::leaf::${leaf}`)!;
  }
  if (auditReasonsByLeaf[leaf]) return auditReasonsByLeaf[leaf];
  throw new Error(`missing reason for ${file} :: ${testName}`);
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const allKeys = [...main, ...auditMeasure];

const entries = allKeys.map(({ file, testName }, i) => {
  const reason = reasonFor(file, testName);
  return `  {
    id: ${i + 1},
    file: "${file}",
    testName: "${esc(testName)}",
    classification: "A",
    reason: "${esc(reason)}",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  }`;
});

const out = `/**
 * Audit of tests that end with \`state.pendingTargetEffect\` still set.
 *
 * Measured on origin/main (2026-09-08) via afterEach probe in
 * tests/fixtures/setup.ts + vitest run (keys use task.fullTestName when present):
 *   vitest.config.ts: ${main.length} allowlisted test ends
 *   vitest.audit.config.ts: ${auditMeasure.length} additional test ends
 *   Combined allowlist keys: ${allKeys.length}
 *
 * Both configs share setupFiles: ["./tests/fixtures/setup.ts"], so the strict-choose
 * afterEach gate covers both suites.
 *
 * Classifications:
 *   A — Prompt-is-the-subject: pending state, pool, snapshot/undo, or lifecycle.
 *   B — Silently unresolved (three fixed in I2; no longer in this table).
 *
 * Allowlist keys use file + fullTestName (suite path + it title). Renaming an
 * allowlisted test makes the gate fail rather than silently skipping coverage.
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
${entries.join(",\n")},
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
console.log(`wrote ${allKeys.length} entries`);
