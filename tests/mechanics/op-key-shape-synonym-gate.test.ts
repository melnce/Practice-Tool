/**
 * Gate sabotage for BH synonym cleanup — fallback_leader, stat amount, discard keys, random pick.
 */
import { describe, it, expect } from "vitest";
import { checkOpKeyShape } from "../../scripts/check-canonical-form.js";
import { checkOpKeysForCard } from "../../scripts/op-keys-gate.js";

const base = {
  id: "99999998",
  name: "BH Gate Sabotage",
  type: "Spell",
  class: "Neutral",
  cost: "0",
};

function shapeWarnings(card: Record<string, unknown>) {
  return checkOpKeyShape(card as Parameters<typeof checkOpKeyShape>[0]);
}

describe("op-key-shape synonym gate sabotage", () => {
  it("flags fallback_leader on damage", () => {
    const card = {
      ...base,
      spell: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 1,
          select: 1,
          fallback_leader: true,
        },
      ],
    };
    const warnings = shapeWarnings(card);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.id === "99999998")).toBe(true);
    expect(warnings.some((w) => w.note?.includes("fallback_leader"))).toBe(
      true,
    );
  });

  it("flags stat amount", () => {
    const card = {
      ...base,
      spell: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          select: 1,
          amount: 1,
          attack: 1,
          defense: 1,
        },
      ],
    };
    const warnings = shapeWarnings(card);
    expect(warnings.some((w) => w.note?.includes("amount"))).toBe(true);
  });

  it("flags countdown random:true", () => {
    const card = {
      ...base,
      spell: [
        {
          op: "countdown",
          action: "delay",
          board_name: "Test",
          select: 1,
          random: true,
        },
      ],
    };
    const warnings = shapeWarnings(card);
    expect(warnings.some((w) => w.note?.includes("countdown"))).toBe(true);
  });
});

describe("op-keys-gate discard/stat allowlist sabotage", () => {
  const cardBase = {
    id: "99999997",
    name: "OpKeys Sabotage",
    type: "Follower",
    class: "Neutral",
    cost: "0",
  };

  it("flags discard select key", () => {
    const issues = checkOpKeysForCard({
      ...cardBase,
      fanfare: [{ op: "discard", select: 1, optional: true }],
    });
    expect(issues.some((i) => i.message.includes('"select"'))).toBe(true);
    expect(issues.some((i) => i.message.includes('"optional"'))).toBe(true);
  });

  it("flags stat amount key", () => {
    const issues = checkOpKeysForCard({
      ...cardBase,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          select: 1,
          amount: 1,
          attack: 1,
          defense: 1,
        },
      ],
    });
    expect(issues.some((i) => i.message.includes('"amount"'))).toBe(true);
  });
});
