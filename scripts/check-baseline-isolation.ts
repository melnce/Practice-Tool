#!/usr/bin/env tsx
/**
 * Baseline isolation gate — card fingerprints must not depend on pool drive order.
 * Run: npm run check:baseline-isolation
 */

(globalThis as any).HEADLESS = true;

import { initCardDatabaseNode } from "../src/data/cardLoaderNode.js";
import "../src/logic/core/effects/index.js";
import {
  formatIsolationMismatch,
  runBaselineIsolationCheck,
  TARGET_SAMPLE_SIZE,
} from "./lib/baselineIsolation.js";

function main(): void {
  console.log("Checking baseline isolation (order-independent fingerprints)...\n");
  initCardDatabaseNode();

  const report = runBaselineIsolationCheck();
  console.log(
    `Sample: ${report.sampleIds.length} cards (target ${TARGET_SAMPLE_SIZE})`,
  );
  console.log(`Elapsed: ${report.elapsedMs.toFixed(0)}ms`);

  if (report.mismatches.length === 0) {
    console.log("\n✅ Baseline isolation gate passed.");
    process.exit(0);
  }

  console.error(
    `\n❌ ${report.mismatches.length} isolation mismatch(es) — harness state may be leaking between cards:\n`,
  );
  for (const m of report.mismatches) {
    console.error(`  ${formatIsolationMismatch(m)}`);
  }
  process.exit(1);
}

main();
