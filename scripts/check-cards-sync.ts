#!/usr/bin/env tsx
/**
 * scripts/check-cards-sync.ts
 * Verifies cards/all.json and cards/index.json match a fresh merge of cards/sets/.
 * Run: npm run check:cards
 */

import fs from "fs";
import { isDeepStrictEqual } from "node:util";
import {
  ALL_FILE,
  INDEX_FILE,
  SETS_DIR,
  mergeSetsFromDisk,
} from "./mergeSets.js";

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function main() {
  console.log(
    "🔍 Checking card data sync (cards/sets/ → all.json + index.json)...\n",
  );

  const { allCards: expectedCards, indexData: expectedIndex } =
    mergeSetsFromDisk();
  const actualCards = readJson(ALL_FILE);
  const actualIndex = readJson(INDEX_FILE);

  let failed = false;

  if (!Array.isArray(actualCards)) {
    console.error("❌ cards/all.json is not an array.");
    failed = true;
  } else if (!isDeepStrictEqual(expectedCards, actualCards)) {
    console.error(
      `❌ cards/all.json is out of sync with cards/sets/ (expected ${expectedCards.length} cards, found ${actualCards.length}).`,
    );
    console.error("   Run: npm run cards:update");
    failed = true;
  } else {
    console.log(
      `✅ cards/all.json matches merged sets (${expectedCards.length} cards)`,
    );
  }

  if (!isDeepStrictEqual(expectedIndex, actualIndex)) {
    console.error("❌ cards/index.json is out of sync with cards/sets/.");
    console.error("   Run: npm run cards:update");
    failed = true;
  } else {
    console.log(
      `✅ cards/index.json matches (${Object.keys(expectedIndex).length} sets)`,
    );
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`\n   Source: ${SETS_DIR}`);
  console.log("   Card data sync OK.\n");
}

main();
