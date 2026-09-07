#!/usr/bin/env tsx
/**
 * Values gate — every `{...}` template in card data must be recognized by values.ts.
 * Run: npm run check:values
 */

import { loadCardsForGates } from "./lib/loadCards.js";
import { runValuesGate } from "./values-gate.js";

function main() {
  console.log("🔍 Checking dynamic value templates in card data...\n");

  const cards = loadCardsForGates().map(({ card }) => card);
  const report = runValuesGate(cards);

  console.log(
    `Census: ${report.census.distinctTemplates} distinct templates in ${report.census.totalUses} uses`,
  );
  for (const row of report.census.templates) {
    console.log(`  ${row.count} ${row.template}`);
  }

  if (report.issues.length) {
    console.error(`\n❌ ${report.issues.length} unrecognized template(s):`);
    for (const issue of report.issues) {
      console.error(`  [${issue.cardId}] ${issue.cardName} — ${issue.message}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Values gate passed.");
  process.exit(0);
}

main();
