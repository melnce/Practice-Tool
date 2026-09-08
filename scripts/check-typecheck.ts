#!/usr/bin/env tsx
/**
 * Extended typecheck gate — src/, scripts/, tests/.
 *
 *   npm run typecheck:extended
 */
import { runTypecheckGate } from "./lib/typecheckGate.js";

const report = runTypecheckGate();

if (report.errors.length > 0) {
  console.error(`typecheck gate failed (${report.errors.length} issue(s)):\n`);
  for (const err of report.errors) {
    console.error(`  ${err}`);
  }
  console.error(
    `\n  live=${report.diagnostics.length} dangerous=${report.dangerous.length} allowlisted=${report.allowlisted.length} new=${report.unallowlisted.length} stale=${report.unmatchedAllowlist.length}`,
  );
  process.exit(1);
}

console.log(
  `typecheck gate passed (${report.allowlisted.length} allowlisted diagnostic(s), 0 dangerous)`,
);
process.exit(0);
