import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeAll } from "vitest";
import {
  buildDeckCodeCatalog,
  deckFileFromGetDeck,
  computeManaCurveFromIds,
  buildCostById,
  encodeDeckHash,
  formatManaCurveMismatch,
  parseGetDeckResponse,
  type DeckCodeCard,
} from "../../scripts/lib/deckCode.js";
import {
  buildArchetypeMap,
  cardCountsFromDeck,
  countAwareJaccard,
  diffMetaAgainstLibrary,
  metaDeckFilename,
  processMetaDeck,
  resolveArchetypeName,
  type WbArtsDeck,
} from "../../scripts/lib/metaDecks.js";
import {
  buildCardIndex,
  type BuildCardIndexInput,
} from "../../src/data/cardIndex.js";
import type { DeckFileObject } from "../../scripts/lib/deckCode.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/meta-decks");

function loadJson<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8"),
  ) as T;
}

describe("meta decks", () => {
  let catalog = buildDeckCodeCatalog([]);
  let cards: DeckCodeCard[] = [];
  let index = buildCardIndex({ mainCards: [], tokenCards: [] });
  let feedDecks: WbArtsDeck[] = [];
  let archetypes = new Map<
    string,
    { id: string; class_id: number; name_jpn?: string }
  >();

  beforeAll(() => {
    cards = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as DeckCodeCard[];
    catalog = buildDeckCodeCatalog(cards);
    const tokenCards = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
    ) as BuildCardIndexInput["tokenCards"];
    index = buildCardIndex({ mainCards: cards, tokenCards });

    const feed = loadJson<{ decks: WbArtsDeck[] }>("feed.json");
    feedDecks = feed.decks;
    archetypes = buildArchetypeMap(
      loadJson<{
        archetypes: { id: string; class_id: number; name_jpn?: string }[];
      }>("archetypes.json").archetypes,
    );
  });

  it("resolves archetype name from jpn when eng is empty", () => {
    expect(resolveArchetypeName("local:3", archetypes)).toBe("中速冥界");
  });

  it("writes valid feed deck with expected filename and hash", () => {
    const deck = feedDecks[0];
    const fetchedAt = "2026-09-06T12:00:00.000Z";
    const result = processMetaDeck(deck, archetypes, catalog, index, fetchedAt);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.filename).toBe(
      "abysscraft_midrange_abyss_by_ukyo0120_wb-meta-001.json",
    );
    expect(result.result.indexEntry.archetype).toEqual({
      id: "local:3",
      name: "中速冥界",
    });
    expect(result.result.indexEntry.hash).toBe(
      encodeDeckHash({
        classId: 5,
        cardIds: Object.entries(deck.cards).flatMap(([id, count]) =>
          Array.from({ length: count }, () => id),
        ),
      }),
    );
    expect(result.result.deck.size).toBe(40);
    expect(result.result.deck.cards.length).toBeGreaterThan(0);
  });

  it("skips deck with a fourth copy", () => {
    const result = processMetaDeck(
      feedDecks[1],
      archetypes,
      catalog,
      index,
      "2026-09-06T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.skip.reasons.some((r) => /4 times|max 3 copies/i.test(r)),
    ).toBe(true);
  });

  it("skips deck with unknown card id", () => {
    const result = processMetaDeck(
      feedDecks[2],
      archetypes,
      catalog,
      index,
      "2026-09-06T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.skip.reasons.some((r) => r.includes('Unknown card id "99999999"')),
    ).toBe(true);
  });

  it("diff table for fixture library yields expected overlap numbers", () => {
    const valid = processMetaDeck(
      feedDecks[0],
      archetypes,
      catalog,
      index,
      "2026-09-06T12:00:00.000Z",
    );
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;

    const library = ["midrange_abysscraft.json", "aggro_abysscraft.json"].map(
      (file) => ({
        file,
        deck: loadJson<DeckFileObject>(path.join("library", file)),
      }),
    );

    const { metaRows, orphanRows } = diffMetaAgainstLibrary(
      [{ id: feedDecks[0].id, deck: valid.result.deck }],
      library,
    );

    expect(metaRows).toHaveLength(1);
    expect(metaRows[0].closestLibrary).toBe("midrange_abysscraft.json");
    expect(metaRows[0].overlapPct).toBe(100);
    expect(metaRows[0].onlyMeta).toHaveLength(0);
    expect(metaRows[0].onlyOurs).toHaveLength(0);
    expect(metaRows[0].countDiffs).toHaveLength(0);

    const aggroOrphan = orphanRows.find(
      (r) => r.libraryDeck === "aggro_abysscraft.json",
    );
    expect(aggroOrphan?.overlapPct).toBe(19.4);
    expect(aggroOrphan?.noCounterpart).toBe(true);

    const midrangeOrphan = orphanRows.find(
      (r) => r.libraryDeck === "midrange_abysscraft.json",
    );
    expect(midrangeOrphan?.noCounterpart).toBe(false);
  });

  it("import-code fixture parses into a 40-card deck", () => {
    const body = loadJson<unknown>("get-deck-midrange.json");
    const data = parseGetDeckResponse(body);
    const deck = deckFileFromGetDeck(data, catalog, "Imported Midrange");
    expect(deck.size).toBe(40);
    expect(deck.class).toBe("Abysscraft");
    const total = deck.cards.reduce((n, c) => n + c.count, 0);
    expect(total).toBe(40);
  });

  it("flags mana-curve mismatch when fixture curve is altered", () => {
    const body = loadJson<unknown>("get-deck-mana-mismatch.json");
    const data = parseGetDeckResponse(body);
    const costById = buildCostById(cards);
    const computed = computeManaCurveFromIds(
      data.sort_card_id_list.map(String),
      costById,
    );
    const mismatch = formatManaCurveMismatch(computed, data.mana_curve ?? []);
    expect(mismatch).toContain("cost 1");
  });

  it("metaDeckFilename matches class_slug_id pattern", () => {
    expect(metaDeckFilename(feedDecks[0])).toBe(
      "abysscraft_midrange_abyss_by_ukyo0120_wb-meta-001.json",
    );
  });

  it("count-aware Jaccard is symmetric", () => {
    const a = loadJson<DeckFileObject>(
      path.join("library", "midrange_abysscraft.json"),
    );
    const b = loadJson<DeckFileObject>(
      path.join("library", "aggro_abysscraft.json"),
    );
    const ca = cardCountsFromDeck(a);
    const cb = cardCountsFromDeck(b);
    expect(countAwareJaccard(ca, cb)).toBe(countAwareJaccard(cb, ca));
  });
});
