import { describe, it, expect } from "vitest";
import {
  checkValuesForCard,
  runValuesGate,
} from "../../scripts/values-gate.js";

describe("values gate", () => {
  it("flags an unrecognized dynamic template", () => {
    const card = {
      id: "99999992",
      name: "Broken Template Card",
      fanfare: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: "{self.atack}",
        },
      ],
    };
    const issues = checkValuesForCard(card);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/unrecognized value template/i);
    expect(issues[0]?.jsonPath).toBe("fanfare[0].amount");

    const report = runValuesGate([card]);
    expect(report.exitCode).toBe(1);
  });

  it("passes for a recognized template", () => {
    const card = {
      id: "99999993",
      name: "Good Template Card",
      fanfare: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: "{self.attack}",
        },
      ],
    };
    expect(runValuesGate([card]).exitCode).toBe(0);
  });
});
