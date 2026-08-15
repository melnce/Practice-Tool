import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  buildRandomLegalDeck,
  deckSpecForSeed,
  injectSpotlightCard,
  SOAK_SPOTLIGHT_CARD_IDS,
  SOAK_HIGH_COST_THRESHOLD,
} from "../../src/bench/soakDecks.js";
import { createRng } from "../../src/core/rng.js";
import { getGlobalCardIndex } from "../../src/data/cardIndex.js";
import { REFERENCE_DECK_SIZE } from "../../src/data/deckValidation.js";

describe("soak deck spotlight / high-cost reachability", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  it("buildRandomLegalDeck stays size 40 and includes a high-cost when available", () => {
    const raw = buildRandomLegalDeck(createRng("t"), "Dragoncraft", "t");
    expect(raw.size).toBe(REFERENCE_DECK_SIZE);
    expect(raw.cards.reduce((s, c) => s + c.count, 0)).toBe(
      REFERENCE_DECK_SIZE,
    );
    const index = getGlobalCardIndex()!;
    const costs = raw.cards.map((c) => {
      const card = index.byId.get(String(c.id));
      return parseInt(String(card?.cost ?? 0), 10) || 0;
    });
    expect(Math.max(...costs)).toBeGreaterThanOrEqual(SOAK_HIGH_COST_THRESHOLD);
  });

  it("odd games inject a rotating spotlight card into a legal deck", () => {
    const spec = deckSpecForSeed(99, 1);
    expect(spec.regime).toBe("random");
    const spotlight = SOAK_SPOTLIGHT_CARD_IDS[0]!;
    const inA = (spec.deckARaw?.cards || []).some(
      (c) => String(c.id) === spotlight,
    );
    const inB = (spec.deckBRaw?.cards || []).some(
      (c) => String(c.id) === spotlight,
    );
    expect(inA || inB).toBe(true);
  });

  it("injectSpotlightCard refuses off-class cards", () => {
    const raw = buildRandomLegalDeck(createRng("x"), "Forestcraft", "x");
    // Amalia is Swordcraft — should fail on Forestcraft deck
    expect(injectSpotlightCard(raw, "10123140")).toBe(false);
  });
});
