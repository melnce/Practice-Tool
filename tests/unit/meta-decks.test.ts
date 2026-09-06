import fs from "fs";
import os from "os";
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
  listDroppedMetaDeckFiles,
  metaDeckFilename,
  processMetaDeck,
  resolveArchetypeName,
  type MetaDeckIndexEntry,
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
  let archetypes = buildArchetypeMap([]);

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
      loadJson<{ archetypes: unknown[] }>("archetypes.json").archetypes,
    );
  });

  it("resolves archetype name from resolved_name_eng", () => {
    expect(resolveArchetypeName("local:3", archetypes)).toBe("Midrange Abyss");
  });

  it("falls back to resolved_name_jpn when English is empty", () => {
    expect(resolveArchetypeName("local:39", archetypes)).toBe("アグロE");
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
      name: "Midrange Abyss",
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

  // Success shape is synthetic: no live 4-character code was obtained (only
  // result_code 5400 for bad codes). mana_curve length 11 indexed by cost 0–10
  // is inferred and unverified against a live success response.
  it("import-code synthetic fixture parses into a 40-card deck", () => {
    const body = loadJson<unknown>("get-deck-midrange.synthetic.json");
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

  it("metaDeckFilename uses English archetype slug and author", () => {
    expect(metaDeckFilename(feedDecks[0], archetypes)).toBe(
      "abysscraft_midrange_abyss_by_ukyo0120_wb-meta-001.json",
    );
    expect(
      metaDeckFilename(
        {
          ...feedDecks[0],
          id: "22130",
          name: "ミッドレンジNi by @m_applere",
        },
        archetypes,
      ),
    ).toBe("abysscraft_midrange_abyss_by_m_applere_22130.json");
    expect(
      metaDeckFilename(
        {
          ...feedDecks[0],
          id: "150502",
          name: "17 Wins Nightmare by @hystarfay53",
        },
        archetypes,
      ),
    ).toBe("abysscraft_midrange_abyss_by_hystarfay53_150502.json");
  });

  it("removes only files listed in the old index that are absent from the new index", () => {
    const oldIndex: MetaDeckIndexEntry[] = [
      {
        id: "old-1",
        canonical_id: "c1",
        class: "Abysscraft",
        archetype: { id: "local:3", name: "Midrange Abyss" },
        source: "svwbmeta",
        source_url: "",
        rating: 0,
        win_count: 0,
        posted_at: "",
        recommendation_score: 0,
        fetched_at: "",
        file: "abysscraft_midrange_abyss_by_old_1.json",
        hash: "h1",
      },
      {
        id: "old-2",
        canonical_id: "c2",
        class: "Abysscraft",
        archetype: { id: "local:3", name: "Midrange Abyss" },
        source: "svwbmeta",
        source_url: "",
        rating: 0,
        win_count: 0,
        posted_at: "",
        recommendation_score: 0,
        fetched_at: "",
        file: "abysscraft_midrange_abyss_by_old_2.json",
        hash: "h2",
      },
    ];
    const newIndex: MetaDeckIndexEntry[] = [
      {
        ...oldIndex[0],
        id: "new-1",
        file: "abysscraft_midrange_abyss_by_new_1.json",
      },
    ];

    expect(listDroppedMetaDeckFiles(oldIndex, newIndex)).toEqual([
      "abysscraft_midrange_abyss_by_old_1.json",
      "abysscraft_midrange_abyss_by_old_2.json",
    ]);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meta-decks-cleanup-"));
    const dropped = listDroppedMetaDeckFiles(oldIndex, newIndex);
    const stray = "stray_not_in_old_index.json";
    for (const file of [...dropped, newIndex[0].file, stray, "index.json"]) {
      fs.writeFileSync(path.join(tmp, file), "{}\n");
    }

    for (const file of dropped) {
      fs.unlinkSync(path.join(tmp, file));
    }

    expect(fs.existsSync(path.join(tmp, stray))).toBe(true);
    expect(fs.existsSync(path.join(tmp, newIndex[0].file))).toBe(true);
    expect(fs.existsSync(path.join(tmp, dropped[0]))).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
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
