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
import { processCard, type RawCardData } from "../src/data/cardIndex.js";

type EffectNode = Record<string, unknown>;

function walkCardEffects(
  card: RawCardData,
  visitor: (eff: EffectNode, path: string) => void,
) {
  const id = String(card.id ?? "?");

  function walk(eff: unknown, path: string): void {
    if (eff == null) return;
    if (Array.isArray(eff)) {
      eff.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (typeof eff !== "object") return;
    const node = eff as EffectNode;
    if (typeof node.op === "string") {
      visitor(node, `${id} ${path}`);
    }
    for (const [key, val] of Object.entries(node)) {
      if (key === "op") continue;
      if (Array.isArray(val)) {
        val.forEach((item, i) => walk(item, `${path}.${key}[${i}]`));
      } else if (val && typeof val === "object") {
        walk(val, `${path}.${key}`);
      }
    }
  }

  for (const zone of [
    "fanfare",
    "evolve",
    "superevolve",
    "spell",
    "last_words",
  ] as const) {
    const list = (card as Record<string, unknown>)[zone];
    if (Array.isArray(list)) {
      list.forEach((eff, i) => walk(eff, zone + `[${i}]`));
    }
  }
  if (Array.isArray(card.keywords)) {
    card.keywords.forEach((kw, i) => walk(kw, `keywords[${i}]`));
  }
  if (Array.isArray(card.triggers)) {
    card.triggers.forEach((tr, i) => walk(tr, `triggers[${i}]`));
  }
}

/** `parseSelectConfig` reads select / select_count only — not count. */
function validateSelectOps(cards: RawCardData[]): string[] {
  const errors: string[] = [];
  for (const card of cards) {
    walkCardEffects(card, (eff, path) => {
      if (eff.op !== "select") return;
      const hasSelect =
        eff.select !== undefined || eff.select_count !== undefined;
      const isRandomMode =
        eff.mode === "random" &&
        (eff.qty !== undefined || eff.select !== undefined);
      if (eff.count !== undefined) {
        errors.push(
          `${path}: select op uses "count" — use "select" (parseSelectConfig ignores count)`,
        );
      }
      if (!hasSelect && !isRandomMode) {
        errors.push(
          `${path}: select op missing "select" or "select_count"`,
        );
      }
    });
  }
  return errors;
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function main() {
  console.log("🔍 Checking card data sync (cards/sets/ → all.json + index.json)...\n");

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
    console.log(`✅ cards/all.json matches merged sets (${expectedCards.length} cards)`);
  }

  if (!isDeepStrictEqual(expectedIndex, actualIndex)) {
    console.error("❌ cards/index.json is out of sync with cards/sets/.");
    console.error("   Run: npm run cards:update");
    failed = true;
  } else {
    console.log(`✅ cards/index.json matches (${Object.keys(expectedIndex).length} sets)`);
  }

  // Processed templates must expose numeric combat stats (JSON stores strings).
  const statViolations: string[] = [];
  for (const raw of expectedCards as RawCardData[]) {
    const t = processCard(raw);
    if (!t?.id) continue;
    for (const key of ["cost", "attack", "defense"] as const) {
      const v = (t as Record<string, unknown>)[key];
      if (v !== undefined && typeof v !== "number") {
        statViolations.push(`${t.id} ${key}=${String(v)}`);
      }
    }
  }
  if (statViolations.length > 0) {
    console.error(
      `❌ ${statViolations.length} card(s) still have non-numeric stats after processCard.`,
    );
    console.error(`   Examples: ${statViolations.slice(0, 5).join(", ")}`);
    failed = true;
  } else {
    console.log("✅ processCard coerces cost/attack/defense to numbers");
  }

  const selectErrors = validateSelectOps(expectedCards as RawCardData[]);
  if (selectErrors.length > 0) {
    console.error(
      `❌ ${selectErrors.length} select op(s) missing select/select_count or misusing count:`,
    );
    for (const line of selectErrors.slice(0, 15)) {
      console.error(`   ${line}`);
    }
    if (selectErrors.length > 15) {
      console.error(`   … and ${selectErrors.length - 15} more`);
    }
    failed = true;
  } else {
    console.log("✅ select ops declare select / select_count (not count)");
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`\n   Source: ${SETS_DIR}`);
  console.log("   Card data sync OK.\n");
}

main();
