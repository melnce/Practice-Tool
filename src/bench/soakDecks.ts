// src/bench/soakDecks.ts
// Deck regimes for engine soak: shipped pairings + seeded random legal decks.

import { createRng, type RNG } from "../core/rng.js";
import {
  REFERENCE_COPY_LIMIT,
  REFERENCE_DECK_SIZE,
} from "../data/deckValidation.js";
import type { RawDeckObject } from "../data/rawDeck.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";
import { saveImportedDeck } from "../data/importedDeckStore.js";
import { loadMainPoolIds } from "./soakCoverage.js";

export const SHIPPED_DECK_IDS = [
  "starter_deck",
  "forestcraft_combo",
  "swordcraft_rally",
  "runecraft_spellboost",
  "dragoncraft_overflow",
  "abysscraft_necromancy",
  "havencraft_countdown",
  "portalcraft_artifacts",
] as const;

export type DeckRegime = "shipped" | "random";

export type SoakDeckSpec = {
  regime: DeckRegime;
  deckAId: string;
  deckBId: string;
  /** Present for random regime — the raw lists used (for repro dumps). */
  deckARaw?: RawDeckObject;
  deckBRaw?: RawDeckObject;
};

const CRAFTS = [
  "Forestcraft",
  "Swordcraft",
  "Runecraft",
  "Dragoncraft",
  "Abysscraft",
  "Havencraft",
  "Portalcraft",
] as const;

type PoolCard = { id: string; name: string; class: string };

function collectPool(): PoolCard[] {
  const index = getGlobalCardIndex();
  if (!index) throw new Error("[soakDecks] Card index not initialized");
  const main = loadMainPoolIds();
  const out: PoolCard[] = [];
  for (const id of main.keys()) {
    const card = index.byId.get(id);
    if (!card) continue;
    const name = String(card.name ?? main.get(id) ?? "");
    if (!name) continue;
    const klass = typeof card.class === "string" ? card.class : "Neutral";
    out.push({ id, name, class: klass });
  }
  return out;
}

/**
 * Build a legal 40-card deck for `craft` using seeded RNG.
 * Class + Neutral only; at most REFERENCE_COPY_LIMIT copies per card.
 */
export function buildRandomLegalDeck(
  rng: RNG,
  craft: string,
  label: string,
): RawDeckObject {
  const pool = collectPool().filter(
    (c) => c.class === "Neutral" || c.class === craft,
  );
  if (pool.length < 10) {
    throw new Error(
      `[soakDecks] Too few cards for craft ${craft}: ${pool.length}`,
    );
  }

  const counts = new Map<string, { card: PoolCard; count: number }>();
  let total = 0;
  let guard = 0;
  while (total < REFERENCE_DECK_SIZE) {
    guard++;
    if (guard > 50_000) {
      throw new Error(`[soakDecks] Failed to fill deck for ${craft}`);
    }
    const pick = pool[rng.nextInt(pool.length)]!;
    const key = pick.id;
    const cur = counts.get(key);
    if (cur) {
      if (cur.count >= REFERENCE_COPY_LIMIT) continue;
      cur.count++;
    } else {
      counts.set(key, { card: pick, count: 1 });
    }
    total++;
  }

  const cards = [...counts.values()]
    .sort((a, b) => a.card.name.localeCompare(b.card.name))
    .map(({ card, count }) => ({ id: card.id, name: card.name, count }));

  return {
    class: craft,
    deckName: label,
    size: REFERENCE_DECK_SIZE,
    ordered: false,
    cards,
  };
}

/** Register a raw deck in the session import library; returns its id. */
export function registerSoakDeck(raw: RawDeckObject, idHint: string): string {
  const rec = saveImportedDeck({
    raw,
    label: raw.deckName ?? idHint,
    source: "file",
    id: idHint,
  });
  return rec.id;
}

/**
 * Derive deck specs for a soak game from the game seed + index.
 * Even indices → shipped pairing; odd → two random legal decks.
 */
export function deckSpecForSeed(seed: number, gameIndex: number): SoakDeckSpec {
  const rng = createRng(`soak-deck-${seed}-${gameIndex}`);

  if (gameIndex % 2 === 0) {
    const a = SHIPPED_DECK_IDS[rng.nextInt(SHIPPED_DECK_IDS.length)]!;
    let b = SHIPPED_DECK_IDS[rng.nextInt(SHIPPED_DECK_IDS.length)]!;
    // Prefer varied pairings; allow mirror rarely
    if (b === a && rng.nextFloat() < 0.85) {
      b =
        SHIPPED_DECK_IDS[
          (SHIPPED_DECK_IDS.indexOf(a) + 1) % SHIPPED_DECK_IDS.length
        ]!;
    }
    return { regime: "shipped", deckAId: a, deckBId: b };
  }

  const craftA = CRAFTS[rng.nextInt(CRAFTS.length)]!;
  const craftB = CRAFTS[rng.nextInt(CRAFTS.length)]!;
  const deckARaw = buildRandomLegalDeck(
    rng,
    craftA,
    `Soak Random A (${craftA}) #${gameIndex}`,
  );
  const deckBRaw = buildRandomLegalDeck(
    rng,
    craftB,
    `Soak Random B (${craftB}) #${gameIndex}`,
  );
  const deckAId = registerSoakDeck(
    deckARaw,
    `soak_rand_a_${seed}_${gameIndex}`,
  );
  const deckBId = registerSoakDeck(
    deckBRaw,
    `soak_rand_b_${seed}_${gameIndex}`,
  );
  return {
    regime: "random",
    deckAId,
    deckBId,
    deckARaw,
    deckBRaw,
  };
}
