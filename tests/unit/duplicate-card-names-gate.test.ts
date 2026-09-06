import { describe, it, expect } from "vitest";
import { checkDuplicateCollectibleNames } from "../../scripts/check-cards-sync.js";

describe("duplicate collectible names gate", () => {
  it("warns on identical duplicate prints", () => {
    const base = {
      id: "10131320",
      name: "Stormy Blast",
      cost: "2",
      type: "Spell",
      class: "Runecraft",
      spell: [{ op: "damage", target: "enemy:follower", amount: 2 }],
    };
    const report = checkDuplicateCollectibleNames([
      base,
      { ...base, id: "10831310" },
    ]);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings[0]).toMatch(/duplicate name "Stormy Blast"/);
  });

  it("errors when duplicate prints differ", () => {
    const report = checkDuplicateCollectibleNames([
      {
        id: "10131320",
        name: "Stormy Blast",
        cost: "2",
        type: "Spell",
        class: "Runecraft",
        spell: [{ op: "damage", target: "enemy:follower", amount: 2 }],
      },
      {
        id: "10831310",
        name: "Stormy Blast",
        cost: "3",
        type: "Spell",
        class: "Runecraft",
        spell: [{ op: "damage", target: "enemy:follower", amount: 2 }],
      },
    ]);
    expect(report.warnings).toHaveLength(0);
    expect(report.errors[0]).toMatch(/prints differ/i);
  });
});
