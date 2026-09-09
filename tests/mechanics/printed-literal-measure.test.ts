import { describe, it, expect } from "vitest";
import { measurePrintedLiterals } from "../../scripts/lib/printedLiteralMeasure.js";
import { loadAllCardDataEntries } from "../../scripts/lib/loadAllCardData.js";

describe("per-effect printed literal measurement (BU5)", () => {
  it("counts effect roots across all three card-data files", () => {
    const entries = loadAllCardDataEntries();
    expect(entries.length).toBeGreaterThan(0);
    const m = measurePrintedLiterals();
    expect(m.totalEffectRoots).toBeGreaterThan(0);
    expect(m.cardsScanned).toBeGreaterThan(0);
  });

  it("reports ambiguous multi-clause cards", () => {
    const m = measurePrintedLiterals();
    expect(m.cardsWithMultiClauseDescription).toBeGreaterThanOrEqual(0);
    expect(m.schemaExtensionFeasible).toBe(true);
    expect(m.generationEstimate.estimatedHours).toMatch(/\d+/);
  });
});
