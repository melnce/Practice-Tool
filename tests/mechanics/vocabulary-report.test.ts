import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildVocabularyReport,
  formatVocabularyReport,
} from "../../scripts/lib/vocabularyReport.js";
import {
  loadAllCardDataEntries,
  loadUniqueCardsById,
} from "../../scripts/lib/loadAllCardData.js";

const FIXTURE = path.join(
  import.meta.dirname,
  "../fixtures/vocabulary/report.snapshot.txt",
);

describe("vocabulary report (BU3)", () => {
  it("walks all three card-data sources", () => {
    const entries = loadAllCardDataEntries();
    const kinds = new Set(entries.map((e) => e.sourceKind));
    expect(kinds.has("all.json")).toBe(true);
    expect(kinds.has("sets")).toBe(true);
    expect(kinds.has("token_details.json")).toBe(true);
  });

  it("counts unique cards, not per-file duplicates", () => {
    const allEntries = loadAllCardDataEntries();
    const unique = loadUniqueCardsById();
    expect(allEntries.length).toBeGreaterThan(unique.size);
    const report = buildVocabularyReport();
    const statName = report.ops
      .find((o) => o.op === "stat")
      ?.keys.find((k) => k.key === "name");
    expect(statName?.total).toBe(1);
    expect(statName?.collectible).toBe(1);
  });

  it("undocumented summary is empty", () => {
    const report = buildVocabularyReport();
    expect(report.undocumentedSummary).toHaveLength(0);
  });

  it("neuter conditional docs: stat.name surfaces when conditionals omitted", () => {
    const entries = [...loadUniqueCardsById().values()];
    const report = buildVocabularyReport(entries, []);
    expect(
      report.undocumentedSummary.some(
        (r) => r.op === "stat" && r.key === "name",
      ),
    ).toBe(true);
  });

  it("matches committed snapshot", () => {
    const report = buildVocabularyReport();
    const stripTs = (s: string) =>
      s.replace(/generated: .+/, "generated: <snapshot>");
    const text = stripTs(formatVocabularyReport(report));
    const expected = stripTs(fs.readFileSync(FIXTURE, "utf-8"));
    expect(text).toBe(expected);
  });
});
