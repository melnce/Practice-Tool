/**
 * Measure tests ending with pendingTargetEffect still set.
 * Usage: npx tsx scripts/measure-dangling-pending.ts [vitest.config.ts]
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const config = process.argv[2] ?? "vitest.config.ts";
const setupPath = join(process.cwd(), "tests/fixtures/setup.ts");
const outPath = join(
  process.cwd(),
  "scripts/.dangling-pending-measurement.json",
);
let original = readFileSync(setupPath, "utf8");
const gateMarker = '\nimport { afterEach } from "vitest";';
const gateIdx = original.indexOf(gateMarker);
if (gateIdx >= 0) {
  original = `${original.slice(0, gateIdx)}\nexport {};\n`;
}

if (existsSync(outPath)) unlinkSync(outPath);

const probe = `${original}

import { afterEach } from "vitest";
import { getCurrentTest } from "vitest/suite";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { state } from "../../src/core/gameState.js";

const __outPath = join(process.cwd(), "scripts/.dangling-pending-measurement.json");

function __loadRows(): Array<{ file: string; testName: string }> {
  if (!existsSync(__outPath)) return [];
  try {
    return JSON.parse(readFileSync(__outPath, "utf8"));
  } catch {
    return [];
  }
}

function __saveRow(file: string, testName: string) {
  const rows = __loadRows();
  rows.push({ file, testName });
  writeFileSync(__outPath, JSON.stringify(rows, null, 2));
}

afterEach((ctx) => {
  if (!state.pendingTargetEffect) return;
  const test = getCurrentTest();
  const name =
    ctx.task.fullTestName ?? test?.name ?? ctx.task.name;
  let file = test?.file?.filepath ?? ctx.task.file?.filepath ?? "";
  const cwd = process.cwd();
  if (file.startsWith(cwd + "/")) file = file.slice(cwd.length + 1);
  __saveRow(file, name);
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

writeFileSync(setupPath, original);

if (result.status !== 0) {
  console.error(result.stdout?.slice(-4000));
  console.error(result.stderr?.slice(-4000));
  process.exit(result.status ?? 1);
}

if (!existsSync(outPath)) {
  console.log("[]");
  process.exit(0);
}

const rows = JSON.parse(readFileSync(outPath, "utf8"));
console.log(JSON.stringify(rows, null, 2));
console.error(`\n${rows.length} dangling tests (${config})`);
unlinkSync(outPath);
