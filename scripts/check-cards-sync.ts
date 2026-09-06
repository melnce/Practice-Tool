#!/usr/bin/env tsx
/**
 * scripts/check-cards-sync.ts
 * Verifies cards/all.json and cards/index.json match a fresh merge of cards/sets/.
 * Also warns on duplicate collectible names and fails when duplicate prints differ.
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

type CardRecord = {
  id: string;
  name: string;
  cost?: unknown;
  attack?: unknown;
  defense?: unknown;
  type?: unknown;
  class?: unknown;
  fanfare?: unknown;
  spell?: unknown;
  evolve?: unknown;
  superevolve?: unknown;
  triggers?: unknown;
};

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function comparablePrint(card: CardRecord) {
  return {
    cost: card.cost,
    attack: card.attack,
    defense: card.defense,
    type: card.type,
    class: card.class,
    fanfare: card.fanfare ?? [],
    spell: card.spell ?? [],
    evolve: card.evolve ?? [],
    superevolve: card.superevolve ?? [],
    triggers: card.triggers ?? [],
  };
}

export function checkDuplicateCollectibleNames(cards: CardRecord[]): {
  warnings: string[];
  errors: string[];
} {
  const byName = new Map<string, CardRecord[]>();
  for (const card of cards) {
    if (!card?.name) continue;
    const group = byName.get(card.name) ?? [];
    group.push(card);
    byName.set(card.name, group);
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  for (const [name, prints] of byName) {
    if (prints.length < 2) continue;
    const [first, second] = prints;
    const same = isDeepStrictEqual(
      comparablePrint(first),
      comparablePrint(second),
    );
    const ids = prints.map((card) => card.id).join(", ");
    if (same) {
      warnings.push(
        `duplicate name "${name}" on ids ${ids} — prints are identical (deck import resolves to newest set order)`,
      );
    } else {
      errors.push(
        `duplicate name "${name}" on ids ${ids} — prints differ in cost/attack/defense/type/class or effect arrays`,
      );
    }
  }

  return { warnings, errors };
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

  if (Array.isArray(actualCards)) {
    const duplicateReport = checkDuplicateCollectibleNames(
      actualCards as CardRecord[],
    );
    if (duplicateReport.warnings.length) {
      console.warn("\n⚠️  Duplicate collectible names (identical prints):");
      for (const warning of duplicateReport.warnings) {
        console.warn(`   ${warning}`);
      }
    }
    if (duplicateReport.errors.length) {
      failed = true;
      console.error("\n❌ Duplicate collectible names with differing prints:");
      for (const error of duplicateReport.errors) {
        console.error(`   ${error}`);
      }
    } else if (!duplicateReport.warnings.length) {
      console.log("✅ No duplicate collectible names");
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`\n   Source: ${SETS_DIR}`);
  console.log("   Card data sync OK.\n");
}

main();
