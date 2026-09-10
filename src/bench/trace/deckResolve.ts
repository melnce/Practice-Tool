// src/bench/trace/deckResolve.ts — Cygames id deck files → registerSoakDeck input

import { getGlobalCardIndex } from "../../data/cardIndex.js";
import type { RawDeckObject } from "../../data/rawDeck.js";
import { REFERENCE_DECK_SIZE } from "../../data/deckValidation.js";

export type IdDeckFile = Record<string, number>;

export function resolveIdDeckFile(raw: IdDeckFile): RawDeckObject {
  const index = getGlobalCardIndex();
  if (!index) {
    throw new Error("[trace] Card index not initialized");
  }

  const cards: Array<{ id: string; name: string; count: number }> = [];
  let total = 0;

  for (const [id, count] of Object.entries(raw)) {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`[trace] Invalid count for card ${id}: ${count}`);
    }
    const card = index.byId.get(id);
    if (!card?.name) {
      throw new Error(`[trace] Unresolvable card id: ${id}`);
    }
    cards.push({ id, name: String(card.name), count: n | 0 });
    total += n | 0;
  }

  if (total !== REFERENCE_DECK_SIZE) {
    throw new Error(
      `[trace] Deck must have ${REFERENCE_DECK_SIZE} cards, got ${total}`,
    );
  }

  return {
    deckName: "trace-deck",
    cards,
    size: total,
  };
}

export function idDeckToSortedArray(raw: IdDeckFile): string[] {
  const out: string[] = [];
  for (const id of Object.keys(raw).sort()) {
    for (let i = 0; i < raw[id]!; i++) out.push(id);
  }
  return out;
}
