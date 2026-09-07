#!/usr/bin/env tsx
/**
 * Gate: shipped deck list sites derive from decks/manifest.json.
 * Run: npm run check:deck-rotation
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildManifestFromFilenames,
  shippedDeckIds,
  type DeckManifest,
} from "../src/data/deckManifest.js";
import { SHIPPED_DECK_IDS } from "../src/bench/soakDecks.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../");
const DECKS_DIR = path.join(ROOT, "decks");
const MANIFEST_FILE = path.join(DECKS_DIR, "manifest.json");
const GITIGNORE_FILE = path.join(ROOT, ".gitignore");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function main() {
  const errors: string[] = [];

  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error("Missing decks/manifest.json — run npm run decks:discover");
    process.exit(1);
  }

  const manifest = readJson(MANIFEST_FILE) as DeckManifest;
  const fromManifest = shippedDeckIds(manifest);

  const fromDisk = shippedDeckIds(
    buildManifestFromFilenames(fs.readdirSync(DECKS_DIR)),
  );
  if (fromManifest.join("\0") !== fromDisk.join("\0")) {
    errors.push(
      "decks/manifest.json is stale — run npm run decks:discover (manifest ids differ from decks/ on disk)",
    );
  }

  const soakIds = [...SHIPPED_DECK_IDS].sort((a, b) => a.localeCompare(b));
  if (soakIds.join("\0") !== fromManifest.join("\0")) {
    errors.push(
      `soak pool (${soakIds.length} ids) does not match manifest shipped decks (${fromManifest.length} ids)`,
    );
  }

  const gitignore = fs.readFileSync(GITIGNORE_FILE, "utf-8");
  const manualUnignore = gitignore
    .split("\n")
    .filter((line) => /^!decks\/[^/]+\.json$/.test(line.trim()));
  if (manualUnignore.length > 0) {
    errors.push(
      `.gitignore has ${manualUnignore.length} hand-maintained !decks/<id>.json un-ignore line(s) — shipped decks should not need per-deck gitignore entries`,
    );
  }

  if (errors.length > 0) {
    console.error("check:deck-rotation failed:\n");
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `check:deck-rotation OK (${fromManifest.length} shipped deck(s) from manifest)`,
  );
}

main();
