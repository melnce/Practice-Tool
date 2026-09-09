import { describe, it, expect } from "vitest";
import {
  checkOpKeysForCard,
  checkTriggerConditionKeysForCard,
  OPS_CARD_NARROWING_IN_FILTER,
} from "../../scripts/op-keys-gate.js";
import { KEYWORDS_SUPPORTING_STAT_DURATION } from "../../src/logic/core/keywords/apply.js";

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

describe("op-keys gate — stat/destroy/keyword card-narrowing in filter", () => {
  for (const op of ["stat", "destroy", "keyword"] as const) {
    it(`flags condition.tribe on ${op} op`, () => {
      const issues = checkOpKeysForCard({
        id: `BAD_${op.toUpperCase()}_COND`,
        name: `Bad ${op}`,
        fanfare: [
          {
            op,
            target: "ally:follower",
            condition: { tribe: "Pixie" },
          },
        ],
      });
      const narrow = issues.filter((i) => i.message.includes("card-narrowing"));
      expect(narrow.length).toBeGreaterThan(0);
      expect(narrow[0]?.message).toMatch(/use filter\.\{tribe\}/);
    });

    it(`allows filter.tribe on ${op} op`, () => {
      const issues = checkOpKeysForCard({
        id: `OK_${op.toUpperCase()}_FILT`,
        name: `Ok ${op}`,
        fanfare: [
          {
            op,
            target: "ally:follower",
            filter: { tribe: "Pixie" },
          },
        ],
      });
      const narrow = issues.filter((i) => i.message.includes("card-narrowing"));
      expect(narrow).toHaveLength(0);
    });
  }

  it("allows stat distribution leftmost with filter.class (Knightly Ardor)", () => {
    const issues = checkOpKeysForCard({
      id: "10423310",
      name: "Knightly Ardor",
      spell: [
        {
          op: "mode",
          options: [
            {
              effects: [
                {
                  op: "stat",
                  action: "give",
                  target: "ally:follower",
                  filter: { class: "Swordcraft" },
                  distribution: "leftmost",
                  attacks_per_turn: 2,
                },
              ],
            },
          ],
        },
      ],
    });
    const narrow = issues.filter((i) => i.message.includes("card-narrowing"));
    expect(narrow).toHaveLength(0);
    const leftmostIssues = issues.filter((i) =>
      i.message.includes('filter:"leftmost"'),
    );
    expect(leftmostIssues).toHaveLength(0);
  });

  it("allows stat condition.tribe with attack_source (Amataz carve-out)", () => {
    const issues = checkOpKeysForCard({
      id: "10114130",
      name: "Amataz",
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack_source: "count_in_hand",
          defense_source: "count_in_hand",
          condition: { tribe: "Pixie" },
        },
      ],
    });
    const narrow = issues.filter((i) => i.message.includes("card-narrowing"));
    expect(narrow).toHaveLength(0);
  });

  it("OPS_CARD_NARROWING_IN_FILTER covers stat, destroy, keyword", () => {
    expect(OPS_CARD_NARROWING_IN_FILTER.has("stat")).toBe(true);
    expect(OPS_CARD_NARROWING_IN_FILTER.has("destroy")).toBe(true);
    expect(OPS_CARD_NARROWING_IN_FILTER.has("keyword")).toBe(true);
    expect(OPS_CARD_NARROWING_IN_FILTER.has("damage")).toBe(false);
  });
});

describe("op-keys gate — pool-only keys in condition", () => {
  it("flags filter.not_self on destroy op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_NOT_SELF_FILT",
      name: "Bad Not Self Filter",
      fanfare: [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { not_self: true },
        },
      ],
    });
    const poolOnly = issues.filter((i) => i.message.includes("pool-only"));
    expect(poolOnly.length).toBeGreaterThan(0);
    expect(poolOnly[0]?.message).toMatch(/use condition\.\{not_self\}/);
  });

  it("allows condition.not_self on destroy op", () => {
    const issues = checkOpKeysForCard({
      id: "OK_NOT_SELF_COND",
      name: "Ok Not Self Cond",
      fanfare: [
        {
          op: "destroy",
          target: "ally:follower",
          condition: { not_self: true },
        },
      ],
    });
    const poolOnly = issues.filter((i) => i.message.includes("pool-only"));
    expect(poolOnly).toHaveLength(0);
  });
});

describe("op-keys gate — damage exclude_tribe carve-out", () => {
  it("allows condition.exclude_tribe on damage op", () => {
    const issues = checkOpKeysForCard({
      id: "10603210",
      name: "Dark Dimensions",
      fanfare: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 3,
          condition: { exclude_tribe: "Encroacher" },
        },
      ],
    });
    const narrow = issues.filter((i) => i.message.includes("card-narrowing"));
    expect(narrow).toHaveLength(0);
  });
});

describe("op-keys gate — stat duration keyword grant", () => {
  const allowed = [...KEYWORDS_SUPPORTING_STAT_DURATION][0] ?? "cant_attack";

  it("rejects non-permanent stat granting unsupported keyword", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_STAT_KW_DUR",
      name: "Bad Stat Kw Dur",
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: 0,
          defense: 0,
          keywords: ["Barrier"],
          duration: "turn_end",
        },
      ],
    });
    const durIssues = issues.filter((i) =>
      i.message.includes("cannot grant keyword"),
    );
    expect(durIssues.length).toBeGreaterThan(0);
  });

  it("allows non-permanent stat granting supported keyword", () => {
    const issues = checkOpKeysForCard({
      id: "OK_STAT_KW_DUR",
      name: "Ok Stat Kw Dur",
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: 0,
          defense: 0,
          keywords: [allowed],
          duration: "turn_end",
        },
      ],
    });
    const durIssues = issues.filter((i) =>
      i.message.includes("cannot grant keyword"),
    );
    expect(durIssues).toHaveLength(0);
  });
});

describe("op-keys gate — self-inclusion spelling (BR1)", () => {
  it("flags top-level include_self on stat op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_INC",
      name: "Bad Include",
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          include_self: true,
        },
      ],
    });
    expect(
      issues.some((i) => i.message.includes('top-level "include_self"')),
    ).toBe(true);
  });

  it("flags top-level exclude_self on keyword op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_EXC",
      name: "Bad Exclude",
      fanfare: [
        {
          op: "keyword",
          action: "grant",
          target: "ally:follower",
          exclude_self: true,
          keywords: ["Barrier"],
        },
      ],
    });
    expect(
      issues.some((i) => i.message.includes('top-level "exclude_self"')),
    ).toBe(true);
  });

  it("flags condition.not_self:false on damage op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_NOT_SELF_FALSE",
      name: "Bad Not Self False",
      fanfare: [
        {
          op: "damage",
          target: "all:follower",
          amount: 2,
          condition: { not_self: false },
        },
      ],
    });
    expect(issues.some((i) => i.message.includes("not_self:false"))).toBe(true);
  });

  it("allows gate exclude_self on Monster Litterateur carve-out", () => {
    const issues = checkOpKeysForCard({
      id: "10501110",
      name: "Monster Litterateur",
      fanfare: [
        {
          op: "gate",
          condition: "field_matches",
          exclude_self: true,
          count: 1,
          effects: [],
        },
      ],
    });
    const excIssues = issues.filter((i) =>
      i.message.includes('top-level "exclude_self"'),
    );
    expect(excIssues).toHaveLength(0);
  });
});

describe("op-keys gate — stat until_end_of_turn spelling (BR2)", () => {
  it("flags until_end_of_turn on stat op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_UET",
      name: "Bad UET",
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack: 1,
          until_end_of_turn: true,
        },
      ],
    });
    expect(issues.some((i) => i.message.includes("until_end_of_turn"))).toBe(
      true,
    );
  });
});

describe("op-keys gate — select boolean spelling (BR4)", () => {
  it("flags select:true on summon op", () => {
    const issues = checkOpKeysForCard({
      id: "BAD_SEL",
      name: "Bad Select",
      fanfare: [{ op: "summon", source: "hand", select: true }],
    });
    expect(issues.some((i) => i.message.includes("select:true"))).toBe(true);
  });
});
