// src/data/cardLoaderNode.ts
// ─────────────────────────────────────────────────────────────────────────────
// NODE.JS CARD LOADER - Synchronous file-based loading for headless/replay
// This module should ONLY be imported in Node.js environments (scripts, tests)
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { RawCardData, BuildCardIndexInput } from "./cardIndex.js";
import { initCardDatabase } from "./cardIndex.js";
import { initCardSets } from "./cardSets.js";
import { initOfficialRotationFromJson } from "./officialRotation.js";
// Get directory path for relative imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cardsDirPath(): string {
  return path.resolve(__dirname, "../../cards");
}

/**
 * Load cards synchronously from the file system.
 * This is for Node.js only - use loadCardsBrowser for browser environments.
 */
export function loadCardsNode(): BuildCardIndexInput {
  // Resolve paths relative to project root
  // From src/data/ we need to go up to project root, then into cards/
  const cardsDir = cardsDirPath();

  // Load main cards
  const allJsonPath = path.join(cardsDir, "all.json");
  const allJsonRaw = fs.readFileSync(allJsonPath, "utf-8");
  const allCards: RawCardData[] = JSON.parse(allJsonRaw);

  // Load vanilla lab set (optional)
  let vanillaCards: RawCardData[] = [];
  const vanillaPath = path.join(cardsDir, "vanilla_lab_set.json");
  if (fs.existsSync(vanillaPath)) {
    const vanillaRaw = fs.readFileSync(vanillaPath, "utf-8");
    vanillaCards = JSON.parse(vanillaRaw);
  }

  // Load tokens
  const tokenPath = path.join(cardsDir, "token_details.json");
  const tokenRaw = fs.readFileSync(tokenPath, "utf-8");
  const tokenCards: RawCardData[] = JSON.parse(tokenRaw);

  return {
    mainCards: [...allCards, ...vanillaCards],
    tokenCards,
  };
}

/** Load every set listed in cards/index.json, keyed by filename stem. */
export function loadCardSetsNode(): Record<string, RawCardData[]> {
  const cardsDir = cardsDirPath();
  const indexPath = path.join(cardsDir, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as Record<
    string,
    string
  >;
  const sets: Record<string, RawCardData[]> = {};
  for (const rel of Object.values(index)) {
    const setPath = path.join(cardsDir, rel);
    const setId = path.basename(rel, ".json");
    sets[setId] = JSON.parse(fs.readFileSync(setPath, "utf-8"));
  }
  return sets;
}

/**
 * Initialize card database using Node loader.
 * Convenience function for scripts and tests.
 * Uses static import to ensure single module instance.
 */
export async function initCardDatabaseNode(): Promise<void> {
  const cards = loadCardsNode();
  initCardDatabase(cards);
  initCardSets(loadCardSetsNode());

  const officialMetaPath = path.join(cardsDirPath(), "official-meta.json");
  if (fs.existsSync(officialMetaPath)) {
    initOfficialRotationFromJson(
      JSON.parse(fs.readFileSync(officialMetaPath, "utf-8")) as Record<
        string,
        unknown
      >,
    );
  }
}
