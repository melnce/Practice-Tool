import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  MIN_NAME_MATCH_LENGTH,
  analyzeSubjecthood,
  cardMatchesTitle,
  countClauses,
  parseTestFiles,
  runSubjecthoodDarkGate,
  type SubjecthoodReport,
} from "../../scripts/lib/subjecthood.js";

describe("subjecthood title matching", () => {
  const fixture = `
import { describe, it, expect } from "vitest";

describe("Outer Centaur Centurion (10021130)", () => {
  it("places on board", () => {
    expect(true).toBe(true);
  });
});

describe("filler deck", () => {
  it("uses board filler", () => {
    const id = "10021130";
    expect(id).toBeTruthy();
  });
});
`;

  it("counts a card named in an it title as subject", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subjecthood-"));
    const file = path.join(dir, "sample.test.ts");
    fs.writeFileSync(file, fixture);
    const { assertingBlocks, fileContents } = parseTestFiles([file], {
      inheritDescribeTitles: true,
    });
    const cards = [
      { id: "10021130", name: "Centaur Centurion" },
      { id: "99999999", name: "Never Named" },
    ];
    const report = analyzeSubjecthood(cards, assertingBlocks, fileContents);
    const centaur = report.cards.find((c) => c.cardId === "10021130");
    expect(centaur?.subjectBlockCount).toBe(1);
    expect(centaur?.subjectBlocks[0]?.composedTitle).toContain(
      "Outer Centaur Centurion (10021130)",
    );
    expect(centaur?.mentionedOnlyAsFiller).toBe(false);
  });

  it("does not count a card named only in the test body", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subjecthood-"));
    const file = path.join(dir, "body-only.test.ts");
    fs.writeFileSync(
      file,
      `
import { it } from "vitest";
it("generic title", () => {
  const cardId = "10021130";
  void cardId;
});
`,
    );
    const { assertingBlocks, fileContents } = parseTestFiles([file], {
      inheritDescribeTitles: true,
    });
    const report = analyzeSubjecthood(
      [{ id: "10021130", name: "Centaur Centurion" }],
      assertingBlocks,
      fileContents,
    );
    expect(report.cards[0]?.subjectBlockCount).toBe(0);
    expect(report.cards[0]?.mentionedInTests).toBe(true);
    expect(report.cards[0]?.mentionedOnlyAsFiller).toBe(true);
  });

  it("inherits outer describe titles when inheritDescribeTitles is true", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subjecthood-"));
    const file = path.join(dir, "inherit.test.ts");
    fs.writeFileSync(
      file,
      `
import { describe, it } from "vitest";
describe("Warden of Selflessness (10903110)", () => {
  it("applies Barrier", () => {});
});
`,
    );
    const inherited = parseTestFiles([file], { inheritDescribeTitles: true });
    const reportInherited = analyzeSubjecthood(
      [{ id: "10903110", name: "Warden of Selflessness" }],
      inherited.assertingBlocks,
      inherited.fileContents,
    );
    expect(reportInherited.cards[0]?.subjectBlockCount).toBe(1);

    const strict = parseTestFiles([file], { inheritDescribeTitles: false });
    const reportStrict = analyzeSubjecthood(
      [{ id: "10903110", name: "Warden of Selflessness" }],
      strict.assertingBlocks,
      strict.fileContents,
    );
    expect(reportStrict.cards[0]?.subjectBlockCount).toBe(0);
  });

  it("skips name matching below MIN_NAME_MATCH_LENGTH", () => {
    expect(MIN_NAME_MATCH_LENGTH).toBe(9);
    const short = cardMatchesTitle(
      { id: "10144120", name: "Forte" },
      "Forte draws a card",
    );
    expect(short.byName).toBe(false);
    const full = cardMatchesTitle(
      { id: "10144120", name: "Forte, Blackwing Dragoon" },
      "Forte, Blackwing Dragoon attacks",
    );
    expect(full.byName).toBe(true);
  });
});

describe("subjecthood clause counting", () => {
  it("counts fanfare, evolve, triggers, and crystallize amulet keyword", () => {
    const card = {
      id: "fixture",
      name: "Clause Fixture",
      fanfare: [{ op: "draw", count: 1 }],
      evolve: [{ op: "buff", amount: 1 }],
      triggers: [
        { event: "end_of_turn", effects: [{ op: "draw", count: 1 }] },
        { event: "start_of_turn", effects: [] },
      ],
      keywords: [
        {
          name: "Crystallize",
          cost: 2,
          amuletKeywords: [{ name: "Countdown", cost: 2, effects: [] }],
        },
      ],
    };
    expect(countClauses(card)).toBe(4);
  });
});

describe("subjecthood dark gate", () => {
  function minimalReport(darkCardIds: string[]): SubjecthoodReport {
    return {
      generatedAt: new Date().toISOString(),
      options: {
        inheritDescribeTitles: true,
        testRoots: ["tests"],
        testGlobs: ["**/*.test.ts"],
      },
      poolSize: 1,
      summary: {
        withAtLeastOneSubjectBlock: 0,
        withExactlyOneSubjectBlock: 0,
        zeroSubject: darkCardIds.length,
        mentionedOnlyAsFiller: 0,
        neverMentioned: 0,
        fewerSubjectBlocksThanClauses: 0,
        dark: darkCardIds.length,
        matchedByNameOnly: 0,
      },
      cards: darkCardIds.map((id) => ({
        cardId: id,
        cardName: id,
        subjectBlockCount: 0,
        subjectBlocks: [],
        matchedById: false,
        matchedByName: false,
        matchedByNameOnly: false,
        clauseCount: 0,
        paths: ["vanilla_place"],
        vanillaPlaceOnly: true,
        isDark: true,
        mentionedInTests: false,
        mentionedOnlyAsFiller: false,
        neverMentioned: true,
        fewerSubjectBlocksThanClauses: false,
      })),
      darkCardIds,
    };
  }

  it("fails when a new dark card is not allowlisted", () => {
    const gate = runSubjecthoodDarkGate(minimalReport(["10999999"]), []);
    expect(gate.exitCode).toBe(1);
    expect(gate.errors[0]).toMatch(/not in cards\/subjecthood-dark-allowlist/);
  });

  it("fails when an allowlisted card is no longer dark", () => {
    const gate = runSubjecthoodDarkGate(minimalReport([]), [
      { cardId: "10021130", reason: "stale" },
    ]);
    expect(gate.exitCode).toBe(1);
    expect(gate.errors[0]).toMatch(/no longer dark/);
  });

  it("passes when dark set matches allowlist exactly", () => {
    const gate = runSubjecthoodDarkGate(minimalReport(["10021130"]), [
      { cardId: "10021130", reason: "filler only" },
    ]);
    expect(gate.exitCode).toBe(0);
  });
});
