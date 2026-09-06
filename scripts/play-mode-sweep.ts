#!/usr/bin/env tsx
/**
 * Play-mode cost-boundary sweep CLI.
 *
 *   npm run sweep:play-modes
 *
 * Not in the `check` chain. Writes reports/play-mode-sweep/latest.md
 * and latest.json. NODE_ENV=test so dev-only guards throw.
 */

(globalThis as { HEADLESS?: boolean }).HEADLESS = true;
if (!process.env.NODE_ENV) process.env.NODE_ENV = "test";

import {
  ensureSweepCardDb,
  loadSweepCards,
  runPlayModeSweep,
  writeSweepReports,
  INVARIANT_IDS,
} from "./lib/playModeSweep.js";

await ensureSweepCardDb();

const cards = loadSweepCards();
console.log(`play-mode sweep: ${cards.length} cards`);
console.log(cards.map((c) => c.id).join(", "));

const report = runPlayModeSweep(cards);
const paths = writeSweepReports(report);

console.log(`cases: ${report.caseCount}`);
console.log(`runtime: ${report.runtimeMs} ms`);
console.log(`failures: ${report.failureCount}`);
for (const id of INVARIANT_IDS) {
  console.log(`  ${id}: ${report.failures[id].length}`);
}
console.log(`wrote ${paths.md}`);
console.log(`wrote ${paths.json}`);
