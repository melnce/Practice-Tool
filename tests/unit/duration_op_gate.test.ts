import { describe, it, expect } from "vitest";
import { checkDurationOpKeysForCard } from "../../scripts/duration-op-gate.js";

describe("duration-op gate", () => {
  it("flags until_eot on damage op (ignored by engine)", () => {
    const issues = checkDurationOpKeysForCard({
      id: "CORRUPT",
      name: "Corrupt Probe",
      fanfare: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 1,
          until_eot: true,
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/until_eot.*ignored/i);
  });

  it("flags until_eot on stat op (use until_end_of_turn)", () => {
    const issues = checkDurationOpKeysForCard({
      id: "BAD",
      name: "Bad Stat",
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack: 1,
          until_eot: true,
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/until_eot.*ignored/i);
  });
});
