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
import { initCardSets, resetCardSets } from "./cardSets.js";
import {
  initOfficialRotationFromJson,
  resetOfficialRotationForTests,
} from "./officialRotation.js";
// Re-export types if needed
export { getCardDetails, getCardById } from "./cardIndex.js";

// ─────────────────────────────────────────────────────────────────────────────
// Browser Card Loader
// ─────────────────────────────────────────────────────────────────────────────

function browserRoot(): string {
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
  return root;
}

/**
 * Load cards via fetch (Browser Only).
 * Returns raw data suitable for initCardDatabase.
 */
export async function loadCardsBrowser(): Promise<BuildCardIndexInput> {
  const root = browserRoot();
  const ts = Date.now();

  // Parallel fetch for main cards, tokens, and official rotation snapshot
  const [fullRes, tokenRes, vanillaRes, officialMetaRes] = await Promise.all([
    fetch(`${root}cards/all.json?v=${ts}`),
    fetch(`${root}cards/token_details.json?v=${ts}`),
    fetch(`${root}cards/vanilla_lab_set.json`).catch(() => null), // Optional
    fetch(`${root}cards/official-meta.json?v=${ts}`).catch(() => null),
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

  if (officialMetaRes && officialMetaRes.ok) {
    try {
      initOfficialRotationFromJson(await officialMetaRes.json());
    } catch (e) {
      console.warn("Official rotation metadata failed to parse", e);
    }
  } else {
    console.warn(
      "Official rotation metadata missing — UI falls back to set-window heuristic",
    );
  }

  return {
    mainCards: [...fullJson, ...vanillaJson],
    tokenCards: tokenJson,
  };
}

/** Prefetch every set in cards/index.json for synchronous from_set deck replace. */
export async function loadCardSetsBrowser(): Promise<
  Record<string, RawCardData[]>
> {
  const root = browserRoot();
  const ts = Date.now();
  const indexRes = await fetch(`${root}cards/index.json?v=${ts}`);
  if (!indexRes.ok) {
    console.warn(`Card set index failed: ${indexRes.status}`);
    return {};
  }
  const index = (await indexRes.json()) as Record<string, string>;
  const entries = await Promise.all(
    Object.values(index).map(async (rel) => {
      const setId = rel.replace(/^sets\//, "").replace(/\.json$/i, "");
      const res = await fetch(`${root}cards/${rel}?v=${ts}`);
      if (!res.ok) {
        console.warn(`Card set failed: ${rel} (${res.status})`);
        return [setId, [] as RawCardData[]] as const;
      }
      const cards = (await res.json()) as RawCardData[];
      return [setId, cards] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Main entry point for browser app.
 * Loads cards and initializes the global index.
 */
export async function loadCardDatabase() {
  try {
    const [data, sets] = await Promise.all([
      loadCardsBrowser(),
      loadCardSetsBrowser(),
    ]);
    initCardDatabase(data);
    initCardSets(sets);
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
  resetCardSets();
  resetOfficialRotationForTests();
}

// Expose globals for debugging/console access
if (typeof window !== "undefined") {
  (window as any).cardDatabase = {
    getCardDetails: getCardFromIndex,
    getCardById: getCardByIdFromIndex,
    reload: loadCardDatabase,
  };
}
