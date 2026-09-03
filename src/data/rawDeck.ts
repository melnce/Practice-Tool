/** Card entry inside an object-format deck file (e.g. rally_swordcraft.json). */
export interface RawDeckCardEntry {
  name?: string;
  id?: string | number;
  count?: number;
}

/** Structured deck JSON: `{ cards: [...], ordered?: boolean, ... }`. */
export interface RawDeckObject {
  class?: string;
  deckName?: string;
  size?: number;
  ordered?: boolean;
  cards?: RawDeckCardEntry[];
}

/** Item in a bare-array deck file (names only or partial card objects). */
export type RawDeckArrayItem = string | RawDeckCardEntry;

/** Deck JSON as stored on disk — structured object or bare card list. */
export type RawDeck = RawDeckObject | RawDeckArrayItem[];

/** Parsed deck payload after fetch, with runtime metadata attached. */
export type FetchedDeck = RawDeck & { __deckFile: string };

export function isRawDeckObject(raw: RawDeck): raw is RawDeckObject {
  return !Array.isArray(raw);
}
