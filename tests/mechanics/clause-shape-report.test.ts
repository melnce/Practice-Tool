import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildClauseShapeReport,
  formatClauseShapeReport,
  computeOpShapeSignature,
} from "../../scripts/lib/clauseShapeReport.js";

const FIXTURE = path.join(
  import.meta.dirname,
  "../fixtures/clause-shape/report.snapshot.txt",
);

describe("clause-shape report (BU4)", () => {
  it("computes stable op-shape signatures", () => {
    const sig = computeOpShapeSignature({
      op: "damage",
      target: "enemy:follower",
      amount: 3,
      condition: { exclude_tribe: "Golem" },
    });
    expect(sig).toContain("op=damage");
    expect(sig).toContain("condition.keys=exclude_tribe");
  });

  it("is warning-level — report builds without throwing", () => {
    const report = buildClauseShapeReport();
    expect(report.multiShapeClauses.length).toBeGreaterThan(0);
    expect(report.flagged.length).toBeGreaterThanOrEqual(0);
  });

  it("matches committed snapshot", () => {
    const report = buildClauseShapeReport();
    const stripTs = (s: string) =>
      s.replace(/generated: .+/, "generated: <snapshot>");
    const text = stripTs(formatClauseShapeReport(report));
    const expected = stripTs(fs.readFileSync(FIXTURE, "utf-8"));
    expect(text).toBe(expected);
  });
});
