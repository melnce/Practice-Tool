import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildVocabularyReport,
  formatVocabularyReport,
} from "../../scripts/lib/vocabularyReport.js";
import { loadAllCardDataEntries } from "../../scripts/lib/loadAllCardData.js";

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

  it("matches committed snapshot", () => {
    const report = buildVocabularyReport();
    const stripTs = (s: string) =>
      s.replace(/generated: .+/, "generated: <snapshot>");
    const text = stripTs(formatVocabularyReport(report));
    const expected = stripTs(fs.readFileSync(FIXTURE, "utf-8"));
    expect(text).toBe(expected);
  });
});
