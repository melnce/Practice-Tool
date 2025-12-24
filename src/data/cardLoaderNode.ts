// src/data/cardLoaderNode.ts
// ─────────────────────────────────────────────────────────────────────────────
// NODE.JS CARD LOADER - Synchronous file-based loading for headless/replay
// This module should ONLY be imported in Node.js environments (scripts, tests)
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RawCardData, BuildCardIndexInput } from "./cardIndex.js";

// Get directory path for relative imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load cards synchronously from the file system.
 * This is for Node.js only - use loadCardsBrowser for browser environments.
 */
export function loadCardsNode(): BuildCardIndexInput {
  // Resolve paths relative to project root
  // From src/data/ we need to go up to project root, then into cards/
  const cardsDir = path.resolve(__dirname, "../../cards");

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

/**
 * Initialize card database using Node loader.
 * Convenience function for scripts and tests.
 */
export async function initCardDatabaseNode(): Promise<void> {
  const { initCardDatabase } = await import("./cardIndex.js");
  const cards = loadCardsNode();
  initCardDatabase(cards);
}













