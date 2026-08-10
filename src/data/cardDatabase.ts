// src/data/cardDatabase.ts
import type { CardTemplate } from "../core/types/index.js";
import type { BuildCardIndexInput, RawCardData } from "./cardIndex.js";
import {
  getCardDetails as getCardFromIndex,
  getCardById as getCardByIdFromIndex,
  injectCardForTest as injectForTest,
  initCardDatabase,
  resetCardIndex,
} from "./cardIndex.js";
// Re-export types if needed
export { getCardDetails, getCardById } from "./cardIndex.js";

// ─────────────────────────────────────────────────────────────────────────────
// Browser Card Loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load cards via fetch (Browser Only).
 * Returns raw data suitable for initCardDatabase.
 */
export async function loadCardsBrowser(): Promise<BuildCardIndexInput> {
  const win = typeof window !== "undefined" ? (window as any) : {};
  let root = win.APP_ROOT || "/";

  // Guard against window.location access in Node environment
  if (
    root.includes(":5500") &&
    win.location &&
    !win.location.href.includes(":5500")
  ) {
    console.warn("Detected invalid APP_ROOT (5500). Fallback to /");
    root = "/";
  }

  const ts = Date.now();

  // Parallel fetch for main cards and tokens
  const [fullRes, tokenRes, vanillaRes] = await Promise.all([
    fetch(`${root}cards/all.json?v=${ts}`),
    fetch(`${root}cards/token_details.json?v=${ts}`),
    fetch(`${root}cards/vanilla_lab_set.json`).catch(() => null), // Optional
  ]);

  if (!fullRes.ok) throw new Error(`Main cards failed: ${fullRes.status}`);
  const fullJson: RawCardData[] = await fullRes.json();

  if (!tokenRes.ok) throw new Error(`Tokens failed: ${tokenRes.status}`);
  const tokenJson: RawCardData[] = await tokenRes.json();

  let vanillaJson: RawCardData[] = [];
  if (vanillaRes && vanillaRes.ok) {
    try {
      vanillaJson = await vanillaRes.json();
    } catch (e) {
      console.warn("Vanilla lab set failed to parse", e);
    }
  }

  return {
    mainCards: [...fullJson, ...vanillaJson],
    tokenCards: tokenJson,
  };
}

/**
 * Main entry point for browser app.
 * Loads cards and initializes the global index.
 */
export async function loadCardDatabase() {
  try {
    const data = await loadCardsBrowser();
    initCardDatabase(data);
  } catch (e) {
    console.error("Failed to load card database:", e);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy / Test Compatibility
// ─────────────────────────────────────────────────────────────────────────────

// Expose these for tests that might mock them (though usage should be migrated)
export function injectCardForTest(card: CardTemplate) {
  injectForTest(card);
}

export function resetCardDatabaseForTests() {
  resetCardIndex();
}

// Expose globals for debugging/console access
if (typeof window !== "undefined") {
  (window as any).cardDatabase = {
    getCardDetails: getCardFromIndex,
    getCardById: getCardByIdFromIndex,
    reload: loadCardDatabase,
  };
}
