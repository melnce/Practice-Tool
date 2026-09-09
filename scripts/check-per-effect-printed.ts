#!/usr/bin/env tsx
/**
 * Gate: per-op `printed` literals on card data (phase 1).
 *
 * Rules (each enforced separately — see tests/mechanics/per-effect-printed.test.ts):
 * 1. Verbatim substring of card.description after whitespace normalisation.
 * 2. Clause roots only (no op ancestor).
 * 3. No overlapping description spans between clause-root claims.
 *
 * Run: npm run check:per-effect-printed
 */

import { loadCardsForGates } from "./lib/loadCards.js";
import {
  checkPerEffectPrintedForCard,
  measurePrintedCoverage,
} from "./lib/perEffectPrinted.js";

function main() {
  const cards = loadCardsForGates().map(({ card }) => card);
  const coverage = measurePrintedCoverage(cards);

  const issues = cards.flatMap((card) => checkPerEffectPrintedForCard(card));

  console.log("Per-effect printed literal gate\n");
  console.log(
    `Coverage (metric): ${coverage.populated}/${coverage.clauseRoots} clause roots (${coverage.cardsWithPrinted} cards)\n`,
  );

  if (issues.length) {
    console.error(`❌ ${issues.length} per-effect printed issue(s):\n`);
    for (const issue of issues) {
      console.error(
        `  [${issue.id}] ${issue.name} (${issue.rule}): ${issue.message}`,
      );
    }
    process.exit(1);
  }

  console.log("✅ Per-effect printed literal gate passed.");
  process.exit(0);
}

main();
