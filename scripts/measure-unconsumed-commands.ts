/**
 * Measure resolvePendingTarget no-prompt exits during the test suite.
 *
 * Usage:
 *   npx tsx scripts/measure-unconsumed-commands.ts [vitest.config.ts]
 *
 * Output: JSON array of { file, testName, uid } rows (one per no-prompt exit).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const config = process.argv[2] ?? "vitest.config.ts";
const setupPath = join(process.cwd(), "tests/fixtures/setup.ts");
const pristineSetup = readFileSync(setupPath, "utf8");
const outPath = join(
  process.cwd(),
  "scripts/.unconsumed-commands-measurement.json",
);
let original = pristineSetup;
const gateMarker = '\nimport { afterEach } from "vitest";';
const gateIdx = original.lastIndexOf(gateMarker);
if (gateIdx >= 0) {
  original = `${original.slice(0, gateIdx)}\nexport {};\n`;
}

if (existsSync(outPath)) unlinkSync(outPath);

const probe = `${original}

import { afterEach } from "vitest";
import { getCurrentTest } from "vitest/suite";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getNoPromptExits, resetResolveTargetProbe } from "../../src/logic/core/resolveTargetProbe.js";

const __outPath = join(process.cwd(), "scripts/.unconsumed-commands-measurement.json");

function __loadRows(): Array<{ file: string; testName: string; uid: string }> {
  if (!existsSync(__outPath)) return [];
  try {
    return JSON.parse(readFileSync(__outPath, "utf8"));
  } catch {
    return [];
  }
}

function __saveRows(
  rows: Array<{ file: string; testName: string; uid: string }>,
) {
  writeFileSync(__outPath, JSON.stringify(rows, null, 2));
}

function __normalizeFile(filePath: string): string {
  const cwd = process.cwd();
  if (filePath.startsWith(cwd + "/")) return filePath.slice(cwd.length + 1);
  return filePath.replace(/^\\.\\//, "");
}

afterEach((ctx) => {
  const snapshotted = [...getNoPromptExits()];
  resetResolveTargetProbe();
  if (snapshotted.length === 0) return;
  const test = getCurrentTest();
  const name =
    ctx.task.fullTestName ?? test?.name ?? ctx.task.name;
  let file = test?.file?.filepath ?? ctx.task.file?.filepath ?? "";
  file = __normalizeFile(file);
  const rows = __loadRows();
  for (const { uid, callerTestFile } of snapshotted) {
    rows.push({ file, testName: name, uid, callerTestFile: callerTestFile ?? "engine" });
  }
  __saveRows(rows);
});
`;

writeFileSync(setupPath, probe);

const result = spawnSync(
  "npx",
  ["vitest", "run", "-c", config, "--reporter=dot"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", VITEST_MAX_WORKERS: "2" },
    maxBuffer: 50 * 1024 * 1024,
  },
);

writeFileSync(setupPath, pristineSetup);

if (result.status !== 0) {
  console.error(result.stdout?.slice(-8000));
  console.error(result.stderr?.slice(-8000));
  process.exit(result.status ?? 1);
}

if (!existsSync(outPath)) {
  console.log("[]");
  process.exit(0);
}

const rows = JSON.parse(readFileSync(outPath, "utf8"));
console.log(JSON.stringify(rows, null, 2));

const byTest = new Map<string, number>();
for (const row of rows) {
  const key = `${row.file}::${row.testName}`;
  byTest.set(key, (byTest.get(key) ?? 0) + 1);
}
console.error(
  `\n${rows.length} no-prompt exits across ${byTest.size} tests (${config})`,
);
unlinkSync(outPath);
