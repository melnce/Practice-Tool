import { describe, it, expect } from "vitest";
import {
  checkKeywordNamesForCard,
  runKeywordNamesGate,
} from "../../scripts/keyword-names-gate.js";

describe("keyword-names gate", () => {
  it("flags unknown keyword Vulnerable on Beelzebub-style fanfare", () => {
    const card = {
      id: "99999990",
      name: "Broken Keyword Card",
      fanfare: [
        {
          op: "keyword",
          target: "enemy:leader",
          action: "grant",
          keywords: [{ name: "Vulnerable", value: 1 }],
        },
      ],
    };
    const report = runKeywordNamesGate([card], []);
    expect(report.exitCode).toBe(1);
    expect(report.errors[0]?.message).toMatch(/unknown keyword "Vulnerable"/i);
    expect(report.errors[0]?.jsonPath).toMatch(
      /fanfare\[0\]\.keywords\[0\]\.name/,
    );
  });

  it("passes for a handled keyword", () => {
    const card = {
      id: "99999991",
      name: "Ward Card",
      keywords: ["Ward"],
    };
    const report = runKeywordNamesGate([card], []);
    expect(report.exitCode).toBe(0);
    expect(checkKeywordNamesForCard(card, new Map())).toHaveLength(0);
  });
});
