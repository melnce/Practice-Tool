import { describe, it, expect } from "vitest";
import {
  checkOpKeysForCard,
  checkTriggerConditionKeysForCard,
} from "../../scripts/op-keys-gate.js";

describe("op-keys gate — action enums", () => {
  it("flags bogus pp action naming the card", () => {
    const issues = checkOpKeysForCard({
      id: "BOGUS_PP",
      name: "Bogus PP Card",
      description: "test",
      fanfare: [{ op: "pp", action: "bogus", amount: 1 }],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/pp op.*unsupported action "bogus"/i);
    expect(issues[0]?.name).toBe("Bogus PP Card");
  });

  it("allows known crest action", () => {
    const issues = checkOpKeysForCard({
      id: "OK_CREST",
      name: "Ok Crest",
      fanfare: [{ op: "crest", action: "gain", name: "Faith" }],
    });
    const actionIssues = issues.filter((i) => i.message.includes("action"));
    expect(actionIssues).toHaveLength(0);
  });
});

describe("op-keys gate — trigger condition keys", () => {
  it("flags unknown trigger.condition key", () => {
    const issues = checkTriggerConditionKeysForCard({
      id: "BAD_TRIG",
      name: "Bad Trigger",
      description: "test",
      triggers: [
        {
          type: "fanfare",
          condition: { shadows_at_least: 1 },
          effects: [],
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/unsupported key "shadows_at_least"/);
  });

  it("allows known trigger.condition key", () => {
    const issues = checkTriggerConditionKeysForCard({
      id: "OK_TRIG",
      name: "Ok Trigger",
      triggers: [
        {
          type: "fanfare",
          condition: { tribe: "Golem" },
          effects: [],
        },
      ],
    });
    expect(issues).toHaveLength(0);
  });
});

describe("op-keys gate — crest is_faith", () => {
  it("allows is_faith on crest op", () => {
    const issues = checkOpKeysForCard({
      id: "OK_CREST_FAITH",
      name: "Ok Faith Crest",
      fanfare: [{ op: "crest", action: "gain", name: "Faith", is_faith: true }],
    });
    expect(issues).toHaveLength(0);
  });

  it("rejects near-miss is_faith_crest on crest op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_CREST_FAITH",
      name: "Bad Faith Crest",
      fanfare: [
        {
          op: "crest",
          action: "gain",
          name: "Faith",
          is_faith_crest: true,
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(
      /crest op.*unsupported top-level key "is_faith_crest"/i,
    );
  });
});

describe("op-keys gate — damage class", () => {
  it("allows top-level class on damage op with hand_class_count", () => {
    const issues = checkOpKeysForCard({
      id: "OK_DMG_CLASS",
      name: "Ok Damage Class",
      fanfare: [
        {
          op: "damage",
          target: "enemy:follower",
          amount_source: "hand_class_count",
          class: "Neutral",
        },
      ],
    });
    expect(issues).toHaveLength(0);
  });

  it("rejects near-miss card_class on damage op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_DMG_CLASS",
      name: "Bad Damage Class",
      fanfare: [
        {
          op: "damage",
          target: "enemy:follower",
          amount_source: "hand_class_count",
          card_class: "Neutral",
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(
      /damage op.*unsupported top-level key "card_class"/i,
    );
  });
});
