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

  it("rejects still_alive on a non-damage-victim trigger event", () => {
    const issues = checkTriggerConditionKeysForCard({
      id: "BAD_STILL_ALIVE",
      name: "Bad Still Alive",
      description: "test",
      triggers: [
        {
          event: "end_of_turn",
          condition: { whose_turn: "owner", still_alive: true },
          effects: [],
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(
      /still_alive.*not a damage-victim event/i,
    );
  });

  it("allows still_alive on self_damaged trigger", () => {
    const issues = checkTriggerConditionKeysForCard({
      id: "OK_STILL_ALIVE",
      name: "Ok Still Alive",
      triggers: [
        {
          event: "self_damaged",
          condition: { still_alive: true },
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

describe("op-keys gate — pool narrowing in filter", () => {
  it("flags CARD_CONDITION key in banish.condition naming the card", () => {
    const issues = checkOpKeysForCard({
      id: "10672120",
      name: "Timid Pioneer",
      description: "banish",
      fanfare: [
        {
          op: "banish",
          target: "enemy:follower",
          select: 1,
          condition: { defense_lte: 3 },
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/defense_lte/i);
    expect(issues[0]?.message).toMatch(/use filter/i);
    expect(issues[0]?.name).toBe("Timid Pioneer");
  });

  it("allows pool-only not_self in banish.condition", () => {
    const issues = checkOpKeysForCard({
      id: "10804110",
      name: "Alabaster Bahamut",
      fanfare: [
        {
          op: "banish",
          target: "enemy:follower",
          select: 1,
          condition: { not_self: true },
        },
      ],
    });
    const narrowIssues = issues.filter((i) =>
      i.message.includes("card-narrowing"),
    );
    expect(narrowIssues).toHaveLength(0);
  });

  it("flags cost action key removed from allowlist", () => {
    const issues = checkOpKeysForCard({
      id: "10223110",
      name: "Rosé, Princess Knight",
      fanfare: [
        {
          op: "cost",
          target: "last_drawn",
          action: "set",
          amount: 0,
          mode: "set",
        },
      ],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/unsupported top-level key "action"/i);
    expect(issues[0]?.name).toBe("Rosé, Princess Knight");
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
