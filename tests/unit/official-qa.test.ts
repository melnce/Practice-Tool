/**
 * Official Cygames catalog: parser fixtures + well-formedness of
 * cards/official-meta.json + a visible it.todo backlog per unpinned Q&A.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import {
  OfficialCardsError,
  assembleOfficialCatalog,
  collectOfficialCards,
  collectOfficialFromInput,
  getOfficialCard,
  officialMetaCardIds,
  renderOfficialQaMarkdown,
  stripOfficialMarkup,
  type OfficialCardListResponse,
  type OfficialCardRecord,
  type OfficialMetaFile,
} from "../../scripts/lib/officialCards.js";
import {
  coverOfficialQa,
  loadRepoCards,
  loadTestCorpus,
} from "../../scripts/lib/officialReconcile.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FIXTURE = path.join(ROOT, "tests/fixtures/official");
const META_PATH = path.join(ROOT, "cards/official-meta.json");

function loadFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE, name), "utf-8")) as T;
}

const THREE_CARD_EXPECTED: Record<string, OfficialCardRecord> = {
  "10011110": {
    name: "Fairy Tamer",
    is_token: false,
    card_set_id: 10000,
    is_include_rotation: true,
    deck_enabled_num: 3,
    related_card_ids: ["90011110"],
    questions: [],
  },
  "10012110": {
    name: "May, Journey Elf",
    is_token: false,
    card_set_id: 10000,
    is_include_rotation: true,
    deck_enabled_num: 3,
    related_card_ids: [],
    questions: [
      {
        question:
          "If I play May, Journey Elf after playing 2 other cards this turn, will its Combo (3) ability activate?",
        answer: "Yes. The card being played also counts toward your Combo.",
      },
    ],
  },
  "10263310": {
    name: "Maddening Benison",
    is_token: false,
    card_set_id: 10002,
    is_include_rotation: false,
    deck_enabled_num: 3,
    related_card_ids: [],
    questions: [],
  },
};

describe("official-cards parser / normaliser", () => {
  it("maps a 3-card saved response to the expected meta object", () => {
    const collected = collectOfficialFromInput(
      loadFixture<OfficialCardListResponse>("three-cards.json"),
      {
        lang: "en",
        source: "input:tests/fixtures/official/three-cards.json",
        now: () => new Date("2026-09-06T12:00:00.000Z"),
      },
    );
    expect(officialMetaCardIds(collected.meta)).toEqual([
      "10011110",
      "10012110",
      "10263310",
    ]);
    expect(collected.meta._meta).toEqual({
      fetched_at: "2026-09-06T12:00:00.000Z",
      count: 3,
      lang: "en",
      source: "input:tests/fixtures/official/three-cards.json",
    });
    for (const [id, expected] of Object.entries(THREE_CARD_EXPECTED)) {
      expect(getOfficialCard(collected.meta, id)).toEqual(expected);
    }
  });

  it("strips <b> / <color=…> markup from Q&A and names", () => {
    const page = loadFixture<OfficialCardListResponse>("markup-qa.json");
    const assembled = assembleOfficialCatalog([page]);
    const rec = assembled.records.get("10012110");
    expect(rec?.name).toBe("May, Journey Elf");
    expect(rec?.questions).toEqual([
      {
        question: "Does Combo count the card being played?",
        answer: "Yes. The card being played also counts toward your Combo.",
      },
    ]);
    expect(stripOfficialMarkup("<b>Yes.</b>")).toBe("Yes.");
    expect(
      stripOfficialMarkup(
        "<b><color=Keyword>Fanfare</color></b>: <color=Keyword>Combo</color> (3)",
      ),
    ).toBe("Fanfare: Combo (3)");
  });

  it("assembles catalog ids across two fixture pages", async () => {
    const pageA = loadFixture<OfficialCardListResponse>("page-a.json");
    const pageB = loadFixture<OfficialCardListResponse>("page-b.json");
    const collected = await collectOfficialCards({
      lang: "en",
      source: "fixture:paging",
      client: {
        now: () => new Date("2026-09-06T12:00:00.000Z"),
        sleep: async () => undefined,
        getCardList: async (offset: number) => {
          if (offset === 0) return pageA;
          if (offset === 2) return pageB;
          throw new Error(`unexpected offset ${offset}`);
        },
      },
    });
    expect(collected.pages).toHaveLength(2);
    expect(collected.fallbackPages).toHaveLength(0);
    expect(officialMetaCardIds(collected.meta)).toEqual([
      "10011110",
      "10012110",
      "10263310",
    ]);
  });

  it("fetches a missing sort-list id via the per-card fallback", async () => {
    const listPage = loadFixture<OfficialCardListResponse>(
      "missing-id-page.json",
    );
    const cardPage = loadFixture<OfficialCardListResponse>(
      "missing-id-card.json",
    );
    const fetched: string[] = [];
    const collected = await collectOfficialCards({
      lang: "en",
      source: "fixture:fallback",
      client: {
        now: () => new Date("2026-09-06T12:00:00.000Z"),
        sleep: async () => undefined,
        getCardList: async (offset: number) => {
          if (offset !== 0) throw new Error(`unexpected offset ${offset}`);
          return listPage;
        },
        getCard: async (cardId: string) => {
          fetched.push(cardId);
          return cardPage;
        },
      },
    });
    expect(fetched).toEqual(["10263310"]);
    expect(collected.fallbackPages).toHaveLength(1);
    expect(getOfficialCard(collected.meta, "10263310")?.name).toBe(
      "Maddening Benison",
    );
  });

  it("exits as OfficialCardsError naming the missing id on a short --input dump", () => {
    const page = loadFixture<OfficialCardListResponse>("missing-id-page.json");
    try {
      collectOfficialFromInput(page, { lang: "en", source: "input:corrupt" });
      throw new Error("expected OfficialCardsError");
    } catch (err) {
      expect(err).toBeInstanceOf(OfficialCardsError);
      const named = err as OfficialCardsError;
      expect(named.missingIds).toEqual(["10263310"]);
      expect(named.message).toContain("10263310");
    }
  });

  it("renders Q&A markdown with id-sorted sections", () => {
    const collected = collectOfficialFromInput(
      loadFixture<OfficialCardListResponse>("three-cards.json"),
      {
        now: () => new Date("2026-09-06T12:00:00.000Z"),
        source: "https://shadowverse-wb.com",
      },
    );
    const md = renderOfficialQaMarkdown(collected.meta);
    expect(md).toContain("Fetched 2026-09-06");
    expect(md).toContain("1 Q&A entry across 1 card (3 catalog ids)");
    expect(md).toContain("## 10012110 May, Journey Elf");
    expect(md).toContain("**Q:** If I play May, Journey Elf");
    expect(md).toContain("**A:** Yes. The card being played also counts");
    expect(md).not.toContain("Fairy Tamer");
  });
});

function loadCommittedMeta(): OfficialMetaFile {
  if (!fs.existsSync(META_PATH)) {
    throw new Error(
      "cards/official-meta.json is missing — run `npm run cards:official`",
    );
  }
  return JSON.parse(fs.readFileSync(META_PATH, "utf-8")) as OfficialMetaFile;
}

describe("cards/official-meta.json well-formedness", () => {
  it("has _meta.count matching the number of catalog ids and no duplicates", () => {
    const meta = loadCommittedMeta();
    const ids = officialMetaCardIds(meta);
    expect(meta._meta.count).toBe(ids.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => Number(a) - Number(b)));
  });

  it("every catalog id exists in cards/all.json or cards/token_details.json", () => {
    const meta = loadCommittedMeta();
    const ids = officialMetaCardIds(meta);
    const { byId } = loadRepoCards(ROOT);
    expect(ids.filter((id) => !byId.has(id))).toEqual([]);
  });

  it("every related_card_id resolves in official-meta, all.json, or token_details", () => {
    const meta = loadCommittedMeta();
    const ids = officialMetaCardIds(meta);
    const idSet = new Set(ids);
    const { byId } = loadRepoCards(ROOT);
    const unresolved: string[] = [];
    for (const id of ids) {
      const rec = getOfficialCard(meta, id);
      if (!rec) continue;
      for (const related of rec.related_card_ids) {
        if (!idSet.has(related) && !byId.has(related)) {
          unresolved.push(`${id}→${related}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("every record has the required official fields", () => {
    const meta = loadCommittedMeta();
    for (const id of officialMetaCardIds(meta)) {
      const rec = getOfficialCard(meta, id);
      expect(rec, id).toBeDefined();
      expect(rec!.name.length).toBeGreaterThan(0);
      expect(typeof rec!.is_token).toBe("boolean");
      expect(typeof rec!.is_include_rotation).toBe("boolean");
      expect(typeof rec!.card_set_id).toBe("number");
      expect(typeof rec!.deck_enabled_num).toBe("number");
      expect(Array.isArray(rec!.related_card_ids)).toBe(true);
      expect(Array.isArray(rec!.questions)).toBe(true);
    }
  });
});

describe("official Q&A backlog (it.todo per unpinned ruling)", () => {
  const meta = loadCommittedMeta();
  const corpus = loadTestCorpus(path.join(ROOT, "tests"));
  const coverage = coverOfficialQa(meta, corpus);
  const pinned = coverage.filter((r) => r.pinned);
  const unpinned = coverage.filter((r) => !r.pinned);

  it(`coverage rows split into pinned (${String(pinned.length)}) and unpinned (${String(unpinned.length)})`, () => {
    expect(pinned.length + unpinned.length).toBe(coverage.length);
  }, 60_000);

  // One it.todo per unpinned row below — Vitest todo count === unpinned.length
  // by construction (not a separate counter that could drift).
  for (const row of unpinned) {
    it.todo(`${row.id} ${row.name} — Q: ${row.question} / A: ${row.answer}`);
  }
});
