import type { RawDeck, RawDeckCardEntry } from "./rawDeck.js";
import { isRawDeckObject } from "./rawDeck.js";

/** Expand a deck file into individual card entries (counts applied, no shuffle). */
export function expandDeckEntries(raw: RawDeck): RawDeckCardEntry[] {
  const expanded: RawDeckCardEntry[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      expanded.push(typeof item === "string" ? { name: item } : item);
    }
    return expanded;
  }

  if (isRawDeckObject(raw) && Array.isArray(raw.cards)) {
    for (const entry of raw.cards) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        const { count: _omit, ...rest } = entry;
        expanded.push(rest);
      }
    }
  }

  return expanded;
}
