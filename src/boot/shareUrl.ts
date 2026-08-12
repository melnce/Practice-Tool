/**
 * Share / persistence via the address bar.
 *
 * Format: `?seed=<literal>&a=<deckAId>&b=<deckBId>`
 *
 * Deck ids travel with the seed because the same seed with different decks is
 * a different game — a seed alone is not a reproducible share.
 *
 * localStorage is not used here (unreliable in this environment); the URL is
 * the persistence mechanism across reload/share.
 */

import type { SeedLiteral } from "../core/seed.js";
import { normalizeSeed } from "../core/seed.js";

export type ShareParams = {
  seed?: SeedLiteral;
  deckAId?: string;
  deckBId?: string;
};

/** Read share params from a query string (defaults to `window.location.search`). */
export function readShareParams(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): ShareParams {
  const p = new URLSearchParams(search);
  const out: ShareParams = {};
  const seedRaw = p.get("seed");
  if (seedRaw != null && seedRaw.trim() !== "") {
    try {
      out.seed = normalizeSeed(seedRaw);
    } catch {
      // Leave unset — invalid seed in URL should not crash boot.
    }
  }
  const a = p.get("a");
  const b = p.get("b");
  if (a) out.deckAId = a;
  if (b) out.deckBId = b;
  return out;
}

/**
 * Write seed + deck ids into the address bar (replaceState).
 * Preserves unrelated query keys (e.g. `?test=1`).
 */
export function writeShareParams(params: {
  seed: SeedLiteral;
  deckAId: string;
  deckBId: string;
}): void {
  if (typeof window === "undefined" || typeof history === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", String(params.seed));
  url.searchParams.set("a", params.deckAId);
  url.searchParams.set("b", params.deckBId);
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Build a relative share query for tests / clipboard helpers. */
export function formatShareQuery(params: {
  seed: SeedLiteral;
  deckAId: string;
  deckBId: string;
}): string {
  const p = new URLSearchParams();
  p.set("seed", String(params.seed));
  p.set("a", params.deckAId);
  p.set("b", params.deckBId);
  return `?${p.toString()}`;
}
