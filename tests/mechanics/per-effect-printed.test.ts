import { describe, it, expect } from "vitest";
import {
  checkPerEffectPrintedForCard,
  normalizePrintedForCompare,
  isFreeSliceCard,
  collectClauseRoots,
  measurePrintedCoverage,
  isBareKeywordLine,
  STATIC_ABILITY_LINES,
  hasContiguousEffectSpan,
  contiguousEffectSpanLiteral,
  singleRootPrintedLiteral,
} from "../../scripts/lib/perEffectPrinted.js";

const base = {
  id: "99999999",
  name: "Probe Card",
  description: "Fanfare: Deal 2 damage to the enemy leader.",
};

describe("per-effect printed — verbatim", () => {
  it("accepts a whitespace-normalised substring of the description", () => {
    const issues = checkPerEffectPrintedForCard({
      ...base,
      fanfare: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 2,
          printed: "Deal 2 damage to the enemy leader.",
        },
      ],
    });
    expect(issues).toHaveLength(0);
  });

  it("rejects a paraphrase not present in the description", () => {
    const issues = checkPerEffectPrintedForCard({
      ...base,
      fanfare: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 2,
          printed: "Deal 2 to the enemy leader.",
        },
      ],
    });
    expect(issues.some((i) => i.rule === "verbatim")).toBe(true);
    expect(issues[0]?.message).toMatch(/not a verbatim substring/i);
  });

  it("neuter gate: disabled skips verbatim failures", () => {
    const issues = checkPerEffectPrintedForCard(
      {
        ...base,
        fanfare: [
          {
            op: "damage",
            target: "enemy:leader",
            amount: 2,
            printed: "invented text",
          },
        ],
      },
      { disabled: true },
    );
    expect(issues).toHaveLength(0);
  });
});

describe("per-effect printed — clause roots only", () => {
  it("rejects printed on a nested op", () => {
    const issues = checkPerEffectPrintedForCard({
      ...base,
      fanfare: [
        {
          op: "repeat_effect",
          count: 2,
          effects: [
            {
              op: "damage",
              target: "enemy:leader",
              amount: 1,
              printed: "Deal 2 damage to the enemy leader.",
            },
          ],
        },
      ],
    });
    expect(issues.some((i) => i.rule === "clause_root_only")).toBe(true);
    expect(issues[0]?.message).toMatch(/clause roots/i);
  });

  it("neuter gate: disabled skips clause-root failures", () => {
    const issues = checkPerEffectPrintedForCard(
      {
        ...base,
        fanfare: [
          {
            op: "repeat_effect",
            count: 2,
            effects: [
              {
                op: "damage",
                target: "enemy:leader",
                amount: 1,
                printed: "Deal 2 damage to the enemy leader.",
              },
            ],
          },
        ],
      },
      { disabled: true },
    );
    expect(issues).toHaveLength(0);
  });
});

describe("per-effect printed — overlapping claims", () => {
  it("rejects two clause roots claiming identical spans", () => {
    const issues = checkPerEffectPrintedForCard({
      id: "88888888",
      name: "Overlap Card",
      description: "Fanfare: Deal 2 damage.\nEvolve: Deal 2 damage.",
      fanfare: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 2,
          printed: "Deal 2 damage.",
        },
      ],
      evolve: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 2,
          printed: "Deal 2 damage.",
        },
      ],
    });
    expect(issues.some((i) => i.rule === "overlapping_claim")).toBe(true);
    expect(issues[0]?.message).toMatch(/overlap/i);
  });

  it("neuter gate: disabled skips overlap failures", () => {
    const issues = checkPerEffectPrintedForCard(
      {
        id: "88888888",
        name: "Overlap Card",
        description: "Fanfare: Deal 2 damage.\nEvolve: Deal 2 damage.",
        fanfare: [
          {
            op: "damage",
            target: "enemy:leader",
            amount: 2,
            printed: "Deal 2 damage.",
          },
        ],
        evolve: [
          {
            op: "damage",
            target: "enemy:leader",
            amount: 2,
            printed: "Deal 2 damage.",
          },
        ],
      },
      { disabled: true },
    );
    expect(issues).toHaveLength(0);
  });
});

describe("per-effect printed — normalisation reuse", () => {
  it("collapses internal whitespace like the test-side gate", () => {
    expect(
      normalizePrintedForCompare("Deal  2   damage to the enemy leader."),
    ).toBe("Deal 2 damage to the enemy leader.");
  });
});

describe("per-effect printed — free slice census", () => {
  it("recognises example cards from the brief", () => {
    const indomitable = {
      id: "10001110",
      name: "Indomitable Fighter",
      description: "Enhance (4): Give this follower +3/+3.",
      keywords: [
        {
          name: "Enhance",
          cost: 4,
          effects: [
            {
              op: "stat",
              action: "give",
              target: "self",
              attack: 3,
              defense: 3,
            },
          ],
        },
      ],
    };
    expect(isFreeSliceCard(indomitable)).toBe(true);
    expect(collectClauseRoots(indomitable)).toHaveLength(1);
  });
});

describe("per-effect printed — static ability lines (DA1)", () => {
  it("pins the closed static-ability vocabulary", () => {
    expect([...STATIC_ABILITY_LINES].sort()).toEqual(
      [
        "Can attack 2 times per turn.",
        "Can attack 3 times per turn.",
        "Can't attack followers or leaders.",
        "Can't be destroyed by abilities.",
        "Can't be played.",
        "Can't take more than 3 damage at a time.",
        "Ignores Ward.",
      ].sort(),
    );
  });

  it("treats static ability lines as non-effect (bare keyword) lines", () => {
    for (const line of STATIC_ABILITY_LINES) {
      expect(isBareKeywordLine(line)).toBe(true);
    }
  });

  it("makes the four formerly non-contiguous single-root cards contiguous", () => {
    const descriptions = [
      "Fanfare: Transform all Forestcraft cards in your hand that cost 2 or less into copies of Bramble Burst.\nWard.\nCan attack 2 times per turn.",
      "Fanfare: Skybound Art- Deal 5 damage to 2 random enemy followers.\nWard \nCan't take more than 3 damage at a time.",
      "Fanfare: Summon an exact copy of this card.\nRush\nWard\nCan't take more than 3 damage at a time.",
      "Fanfare: If an allied follower attacked a leader on your last turn, give this follower Storm.\nRush\nIgnores Ward.",
    ];
    for (const description of descriptions) {
      expect(hasContiguousEffectSpan(description)).toBe(true);
      expect(contiguousEffectSpanLiteral(description)).toMatch(/^Fanfare:/);
    }
  });
});

describe("per-effect printed — single-root span (DA2)", () => {
  it("derives the full effect span for Opulent Rose Queen", () => {
    const card = {
      id: "10114120",
      name: "Opulent Rose Queen",
      description:
        "Fanfare: Transform all Forestcraft cards in your hand that cost 2 or less into copies of Bramble Burst.\nWard.\nCan attack 2 times per turn.",
      fanfare: [
        {
          op: "transform",
          target: "ally:hand",
          filter: { class: "Forestcraft", cost_lte: 2 },
          into: "Bramble Burst",
        },
      ],
      keywords: ["Ward"],
    };
    expect(singleRootPrintedLiteral(card)).toBe(
      "Fanfare: Transform all Forestcraft cards in your hand that cost 2 or less into copies of Bramble Burst.",
    );
  });
});

describe("per-effect printed — coverage metric", () => {
  it("counts populated clause roots", () => {
    const stats = measurePrintedCoverage([
      {
        ...base,
        fanfare: [
          {
            op: "damage",
            target: "enemy:leader",
            amount: 2,
            printed: "Deal 2 damage to the enemy leader.",
          },
        ],
      },
    ]);
    expect(stats.populated).toBe(1);
    expect(stats.clauseRoots).toBe(1);
    expect(stats.cardsWithPrinted).toBe(1);
  });
});
