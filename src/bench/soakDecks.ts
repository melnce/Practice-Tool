// src/bench/soakDecks.ts
// Deck regimes for engine soak: shipped pairings + seeded random legal decks.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRng, type RNG } from "../core/rng.js";
import { shippedDeckIds, type DeckManifest } from "../data/deckManifest.js";
import {
  REFERENCE_COPY_LIMIT,
  REFERENCE_DECK_SIZE,
} from "../data/deckValidation.js";
import type { RawDeckObject } from "../data/rawDeck.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";
import { saveImportedDeck } from "../data/importedDeckStore.js";
import { loadMainPoolIds } from "./soakCoverage.js";

function loadShippedDeckIds(): readonly string[] {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const manifestPath = path.join(root, "decks/manifest.json");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8"),
  ) as DeckManifest;
  const ids = shippedDeckIds(manifest);
  if (ids.length === 0) {
    throw new Error("[soakDecks] No shipped decks in decks/manifest.json");
  }
  return ids;
}

/** Shipped deck ids for soak pairings — derived from decks/manifest.json (category deck). */
export const SHIPPED_DECK_IDS: readonly string[] = loadShippedDeckIds();

/**
 * Cards the uniform random soak historically never touched (high cost and/or
 * not present in the shipped decks). Odd games rotate a spotlight insert so
 * this class stays reachable without hard-coding play policies per card.
 */
export const SOAK_SPOTLIGHT_CARD_IDS = [
  "10123140", // Amalia, Luxsteel Paladin (8)
  "10141310", // Calamity Breath (6)
  "10142140", // Marion, Ravishing Dragonewt (4, Overflow branch)
  "10173130", // Liam, Crazed Creator (9)
  "10471110", // Sho, Reborn Night King (3, super-evo gate)
  "10734120", // Beloved Masterpiece (9)
  "10744120", // Dragon's Vale Elder (10)
  "10822110", // Katze, Magical Thief (3, spell-play trigger)
  "10824120", // Mars, Conflagrant Commander (8)
  "10861120", // Theresa, Ergon Priestess (7)
] as const;

/** Cost threshold treated as "hard to reach" under short random games. */
export const SOAK_HIGH_COST_THRESHOLD = 7;

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
 * Ensures at least one high-cost (≥ SOAK_HIGH_COST_THRESHOLD) card when the
 * craft pool has one — otherwise late-game cards stay invisible to soak.
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

  const index = getGlobalCardIndex();
  const costOf = (id: string): number => {
    const card = index?.byId.get(id);
    const raw = card?.cost;
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? 0), 10);
    return Number.isFinite(n) ? n : 0;
  };

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

  // Guarantee a high-cost body when the craft can support one.
  const hasHigh = [...counts.keys()].some(
    (id) => costOf(id) >= SOAK_HIGH_COST_THRESHOLD,
  );
  if (!hasHigh) {
    const highPool = pool.filter(
      (c) => costOf(c.id) >= SOAK_HIGH_COST_THRESHOLD,
    );
    if (highPool.length > 0) {
      const high = highPool[rng.nextInt(highPool.length)]!;
      // Free REFERENCE_COPY_LIMIT slots by trimming random other lines.
      let need = REFERENCE_COPY_LIMIT;
      const keys = [...counts.keys()].filter((id) => id !== high.id);
      while (need > 0 && keys.length > 0) {
        const ki = rng.nextInt(keys.length);
        const key = keys[ki]!;
        const cur = counts.get(key)!;
        const take = Math.min(cur.count, need);
        cur.count -= take;
        need -= take;
        if (cur.count <= 0) {
          counts.delete(key);
          keys.splice(ki, 1);
        }
      }
      counts.set(high.id, {
        card: high,
        count: REFERENCE_COPY_LIMIT - need,
      });
    }
  }

  const cards = [...counts.values()]
    .sort((a, b) => a.card.name.localeCompare(b.card.name))
    .map(({ card, count }) => ({ id: card.id, name: card.name, count }));

  return {
    class: craft,
    deckName: label,
    size: cards.reduce((s, c) => s + c.count, 0),
    ordered: false,
    cards,
  };
}

/**
 * Force `cardId` into a raw deck (up to REFERENCE_COPY_LIMIT), replacing other
 * lines as needed. No-ops if the card is illegal for the deck's class.
 */
export function injectSpotlightCard(
  raw: RawDeckObject,
  cardId: string,
): boolean {
  const index = getGlobalCardIndex();
  const card = index?.byId.get(cardId);
  if (!card) return false;
  const klass = typeof card.class === "string" ? card.class : "Neutral";
  const deckClass = String(raw.class ?? "");
  if (klass !== "Neutral" && klass !== deckClass) return false;

  const name = String(card.name ?? cardId);
  const cards = [...(raw.cards ?? [])];
  const existing = cards.find((c) => String(c.id) === cardId);
  let need = REFERENCE_COPY_LIMIT - (existing?.count ?? 0);
  if (need <= 0) return true;

  // Trim other lines to free space while keeping size == REFERENCE_DECK_SIZE.
  while (need > 0) {
    const idx = cards.findIndex(
      (c) => String(c.id) !== cardId && (c.count ?? 0) > 0,
    );
    if (idx < 0) break;
    const line = cards[idx]!;
    line.count = (line.count ?? 1) - 1;
    need--;
    if (line.count <= 0) cards.splice(idx, 1);
  }
  if (existing) {
    existing.count = REFERENCE_COPY_LIMIT;
    existing.name = name;
  } else {
    cards.push({ id: cardId, name, count: REFERENCE_COPY_LIMIT - need });
  }
  raw.cards = cards;
  raw.size = cards.reduce((s, c) => s + (c.count ?? 0), 0);
  return true;
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

  // Rotate spotlight inserts across odd games so high-cost / precondition
  // cards are present in at least one list (reachability, not a play guarantee).
  const spotlight =
    SOAK_SPOTLIGHT_CARD_IDS[
      Math.floor(gameIndex / 2) % SOAK_SPOTLIGHT_CARD_IDS.length
    ]!;
  if (!injectSpotlightCard(deckARaw, spotlight)) {
    injectSpotlightCard(deckBRaw, spotlight);
  }

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
