#!/usr/bin/env tsx
/**
 * Keyword-name gate — every keyword in card data must map to KEYWORD_MAP.
 * Run: npm run check:keyword-names
 */

import { loadCardsForGates } from "./lib/loadCards.js";
import { runKeywordNamesGate } from "./keyword-names-gate.js";

function main() {
  console.log("🔍 Checking keyword names in card data...\n");

  const cards = loadCardsForGates().map(({ card }) => card);
  const report = runKeywordNamesGate(cards);

  console.log("Census — canonical spellings:");
  for (const row of report.census.canonical) {
    console.log(`  ${row.spelling} ${row.count}`);
  }

  console.log("\nCensus — non-canonical spellings:");
  for (const row of report.census.nonCanonical) {
    console.log(`  ${row.spelling} ${row.count}`);
  }

  console.log("\nCensus — singleton spellings:");
  for (const row of report.census.singletons) {
    console.log(`  ${row.spelling} ${row.count}`);
  }

  console.log(
    `\nCensus — entries with no name field: ${report.census.entriesWithNoName}`,
  );

  if (report.warnings.length) {
    console.log(
      `\n⚠️  ${report.warnings.length} non-canonical spelling warning(s):`,
    );
    for (const issue of report.warnings.slice(0, 20)) {
      console.warn(`  [${issue.cardId}] ${issue.cardName} — ${issue.message}`);
    }
    if (report.warnings.length > 20) {
      console.warn(`  … and ${report.warnings.length - 20} more`);
    }
  }

  if (report.errors.length) {
    console.error(`\n❌ ${report.errors.length} keyword gate error(s):`);
    for (const issue of report.errors) {
      console.error(`  [${issue.cardId}] ${issue.cardName} — ${issue.message}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Keyword names gate passed.");
  process.exit(0);
}

main();
