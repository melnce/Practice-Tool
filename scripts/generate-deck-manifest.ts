#!/usr/bin/env tsx
/**
 * Scans decks/*.json and writes decks/manifest.json for the UI dropdown.
 * Run automatically via predev / prebuild, or manually: npm run decks:discover
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildManifestFromFilenames } from "../src/data/deckManifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../");
const DECKS_DIR = path.join(ROOT, "decks");
const MANIFEST_FILE = path.join(DECKS_DIR, "manifest.json");

function main() {
  if (!fs.existsSync(DECKS_DIR)) {
    console.error(`Decks directory not found: ${DECKS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(DECKS_DIR);
  const manifest = buildManifestFromFilenames(files);

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  const decks = manifest.entries.filter((e) => e.category === "deck").length;
  const tests = manifest.entries.filter((e) => e.category === "test").length;
  console.log(
    `Wrote ${MANIFEST_FILE} (${decks} deck(s), ${tests} test deck(s))`,
  );
}

main();
