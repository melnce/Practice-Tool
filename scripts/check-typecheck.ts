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
    `\n  live=${report.diagnostics.length} dangerous=${report.dangerous.length} debt=${report.debt.length}`,
  );
  process.exit(1);
}

console.log(
  `typecheck gate passed (0 dangerous, ${report.debt.length} debt diagnostic(s) not gated)`,
);
process.exit(0);
