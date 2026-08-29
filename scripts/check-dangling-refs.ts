#!/usr/bin/env tsx
/**
 * Gate: card effect trees must not reference card names missing from the database.
 * Catches typos in summon/add_to_hand/crest name fields before they break deck import.
 *
 * Run: npm run check:dangling-refs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_FILE } from "./mergeSets.js";
import { scanDanglingReferences, type RepoCard } from "./lib/ingestCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const TOKEN_FILE = path.join(ROOT, "cards/token_details.json");

function readJson<T>(file: string): T {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function main() {
  console.log(
    "🔍 Checking card effect named references (summon/add_to_hand/crest)...\n",
  );

  const poolCards = readJson<RepoCard[]>(ALL_FILE);
  const tokens = readJson<RepoCard[]>(TOKEN_FILE);

  if (!Array.isArray(poolCards)) {
    console.error("❌ cards/all.json must be an array");
    process.exit(1);
  }
  if (!Array.isArray(tokens)) {
    console.error("❌ cards/token_details.json must be an array");
    process.exit(1);
  }

  const dangling = scanDanglingReferences(poolCards, tokens);

  if (!dangling.length) {
    console.log(
      `✅ zero dangling named references (${poolCards.length} pool + ${tokens.length} tokens)`,
    );
    console.log("");
    return;
  }

  console.error(`❌ ${dangling.length} dangling card name reference(s):\n`);
  for (const row of dangling) {
    console.error(`  "${row.name}" referenced by:`);
    for (const ref of row.refs) {
      console.error(
        `    - ${ref.id} ${ref.cardName} (${ref.op} name="${row.name}")`,
      );
    }
  }
  console.error(
    "\n   Fix the misspelled name or add the missing card to the database.",
  );
  process.exit(1);
}

main();
