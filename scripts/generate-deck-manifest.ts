#!/usr/bin/env tsx
/**
 * Scans decks/*.json and writes decks/manifest.json for the UI dropdown.
 * Run automatically via predev / prebuild, or manually: npm run decks:discover
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildManifestFromFilenames,
  type DeckManifest,
} from "../src/data/deckManifest.js";
import { isRawDeckObject, type RawDeck } from "../src/data/rawDeck.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../");
const DECKS_DIR = path.join(ROOT, "decks");
const MANIFEST_FILE = path.join(DECKS_DIR, "manifest.json");

function deckNameFromFile(file: string): string | undefined {
  const filePath = path.join(DECKS_DIR, file);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RawDeck;
    if (isRawDeckObject(raw) && typeof raw.deckName === "string") {
      const name = raw.deckName.trim();
      return name || undefined;
    }
  } catch {
    /* ignore unreadable / invalid JSON — check:decks will surface it */
  }
  return undefined;
}

function main() {
  if (!fs.existsSync(DECKS_DIR)) {
    console.error(`Decks directory not found: ${DECKS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(DECKS_DIR);
  const manifest: DeckManifest = buildManifestFromFilenames(files);

  for (const entry of manifest.entries) {
    const deckName = deckNameFromFile(entry.file);
    if (deckName) entry.label = deckName;
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  const decks = manifest.entries.filter((e) => e.category === "deck").length;
  const tests = manifest.entries.filter((e) => e.category === "test").length;
  console.log(
    `Wrote ${MANIFEST_FILE} (${decks} deck(s), ${tests} test deck(s))`,
  );
}

main();
