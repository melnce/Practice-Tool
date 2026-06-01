#!/usr/bin/env tsx
/**
 * scripts/check-decks.ts
 * Validates every discoverable deck under decks/ against cards/all.json.
 * Run: npm run check:decks
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildCardIndex, type BuildCardIndexInput } from "../src/data/cardIndex.js";
import {
  buildManifestFromFilenames,
  DECK_FILE_EXCLUDE,
  type DeckManifestEntry,
} from "../src/data/deckManifest.js";
import {
  validateDeckRaw,
  type DeckValidationResult,
} from "../src/data/deckValidation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../");
const DECKS_DIR = path.join(ROOT, "decks");
const CARDS_DIR = path.join(ROOT, "cards");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function loadCardIndex(): ReturnType<typeof buildCardIndex> {
  const allFile = path.join(CARDS_DIR, "all.json");
  const tokenFile = path.join(CARDS_DIR, "token_details.json");
  const vanillaFile = path.join(CARDS_DIR, "vanilla_lab_set.json");

  if (!fs.existsSync(allFile)) {
    throw new Error("Missing cards/all.json — run npm run cards:update");
  }
  if (!fs.existsSync(tokenFile)) {
    throw new Error("Missing cards/token_details.json");
  }

  const mainCards = readJson(allFile) as BuildCardIndexInput["mainCards"];
  const tokenCards = readJson(tokenFile) as BuildCardIndexInput["tokenCards"];

  let mergedMain = mainCards;
  if (fs.existsSync(vanillaFile)) {
    mergedMain = [
      ...mainCards,
      ...(readJson(vanillaFile) as BuildCardIndexInput["mainCards"]),
    ];
  }

  return buildCardIndex({ mainCards: mergedMain, tokenCards });
}

function discoverDeckFiles(): DeckManifestEntry[] {
  const files = fs.readdirSync(DECKS_DIR);
  return buildManifestFromFilenames(files).entries;
}

function printResult(result: DeckValidationResult) {
  const base = result.deckFile.replace(/\.json$/i, "");
  if (result.ok) {
    console.log(`✅ ${base} (${result.cardCount} cards)`);
    for (const w of result.warnings) {
      console.log(`   ⚠ ${w.message}`);
    }
    return;
  }

  console.log(`❌ ${base}`);
  for (const issue of result.issues) {
    console.log(`   • ${issue.message}`);
  }
  for (const w of result.warnings) {
    console.log(`   ⚠ ${w.message}`);
  }
}

function main() {
  console.log("🔍 Checking decks (decks/*.json → cards/all.json)...\n");

  if (!fs.existsSync(DECKS_DIR)) {
    console.error(`Decks directory not found: ${DECKS_DIR}`);
    process.exit(1);
  }

  const index = loadCardIndex();
  const entries = discoverDeckFiles();

  if (entries.length === 0) {
    console.error("No deck files found under decks/");
    process.exit(1);
  }

  const results: DeckValidationResult[] = [];
  let parseFailures = 0;

  for (const entry of entries) {
    const filePath = path.join(DECKS_DIR, entry.file);
    let raw: unknown;
    try {
      raw = readJson(filePath);
    } catch (e) {
      parseFailures++;
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        deckFile: entry.file,
        ok: false,
        issues: [{ kind: "parse", message: `Invalid JSON: ${msg}` }],
        warnings: [],
        cardCount: 0,
      });
      continue;
    }

    results.push(validateDeckRaw(raw, entry.file, index));
  }

  console.log(`Found ${entries.length} deck file(s) (excluded: ${[...DECK_FILE_EXCLUDE].join(", ")})\n`);

  let pass = 0;
  let fail = 0;
  for (const result of results) {
    printResult(result);
    if (result.ok) pass++;
    else fail++;
  }

  console.log(`\nSummary: ${pass} passed, ${fail} failed (${parseFailures} parse error(s))`);

  if (fail > 0) {
    console.error(
      "\nFix unknown cards by adding them to the appropriate cards/sets/ file, then npm run cards:update.",
    );
    process.exit(1);
  }

  console.log("\nAll decks validated.\n");
}

main();
