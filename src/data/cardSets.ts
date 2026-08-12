// src/data/cardSets.ts
// ─────────────────────────────────────────────────────────────────────────────
// Preloaded card-set cache for synchronous deck-replace effects.
// Sets are loaded at card-DB init so effect handlers never await fetch + RNG.
// ─────────────────────────────────────────────────────────────────────────────

import type { RawCardData } from "./cardIndex.js";

const SETS_KEY = "__CARD_SETS__";

type SetMap = Map<string, readonly RawCardData[]>;

function getMap(): SetMap | null {
  return ((globalThis as any)[SETS_KEY] as SetMap | undefined) ?? null;
}

/** Register preloaded set JSON keyed by set id (e.g. "10003_heirs-of-the-omen"). */
export function initCardSets(
  sets: Record<string, readonly RawCardData[]>,
): void {
  (globalThis as any)[SETS_KEY] = new Map(Object.entries(sets));
}

/** Look up a preloaded set by id. Returns null if missing / not initialized. */
export function getSetCards(setId: string): readonly RawCardData[] | null {
  const map = getMap();
  if (!map || !setId) return null;
  return map.get(setId) ?? null;
}

export function resetCardSets(): void {
  (globalThis as any)[SETS_KEY] = null;
}

export function isCardSetsInitialized(): boolean {
  return getMap() !== null;
}
