import { toNumber } from "../core/cardStats.js";
import type { CardIndex } from "../data/cardIndex.js";
import { expandDeckEntries } from "../data/deckExpand.js";
import type { RawDeck } from "../data/rawDeck.js";
import { isRawDeckObject } from "../data/rawDeck.js";
import {
  findUnknownCards,
  formatCardRef,
  resolveCardRef,
  validateDeckRaw,
} from "../data/deckValidation.js";
import type { SimCard } from "./types.js";

export interface ResolvedDeck {
  deckFile: string;
  className: string | undefined;
  deckName: string | undefined;
  cards: SimCard[];
  warnings: string[];
}

/**
 * Expand + resolve a raw deck JSON into SimCard copies using the card index.
 * Does not shuffle. Unknown cards throw.
 */
export function resolveDeckToSimCards(
  raw: RawDeck,
  index: CardIndex,
  deckFile = "deck.json",
): ResolvedDeck {
  const validation = validateDeckRaw(raw, deckFile, index);
  if (!validation.ok) {
    const msg = validation.issues.map((i) => i.message).join("; ");
    throw new Error(`Deck validation failed (${deckFile}): ${msg}`);
  }

  const expanded = expandDeckEntries(raw);
  const unknown = findUnknownCards(expanded, index);
  if (unknown.length > 0) {
    throw new Error(`Unknown cards in ${deckFile}: ${unknown.join(", ")}`);
  }

  const cards: SimCard[] = [];
  for (const entry of expanded) {
    if (!resolveCardRef(index, entry)) {
      throw new Error(`Unresolved card: ${formatCardRef(entry)}`);
    }
    const template =
      (entry.id != null ? index.byId.get(String(entry.id)) : undefined) ??
      (entry.name
        ? (index.byName.get(entry.name) ?? index.tokensByName.get(entry.name))
        : undefined);
    if (!template) {
      throw new Error(`Missing template for ${formatCardRef(entry)}`);
    }
    const key = template.name || String(template.id);
    const card: SimCard = {
      key,
      name: template.name,
      cost: toNumber(template.cost),
    };
    if (template.id) card.id = String(template.id);
    cards.push(card);
  }

  const obj = isRawDeckObject(raw) ? raw : undefined;
  return {
    deckFile,
    className: obj?.class,
    deckName: obj?.deckName,
    cards,
    warnings: validation.warnings.map((w) => w.message),
  };
}

/** Unique card keys in a resolved deck (for UI pickers), preserving first-seen order. */
export function uniqueDeckKeys(cards: readonly SimCard[]): SimCard[] {
  const seen = new Set<string>();
  const out: SimCard[] = [];
  for (const c of cards) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}
