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
  splitNonKeywordSentences,
  resolveRootMarker,
  resolveMultiRootPrintedLiteral,
  isHardMarkerMultiRootCard,
  multiRootPrintedLiterals,
  measureMultiRootBuckets,
  buildKeywordNameMarkerReport,
} from "../../scripts/lib/perEffectPrinted.js";
import { loadCardsForGates } from "../../scripts/lib/loadCards.js";

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

describe("per-effect printed — marker consistency (DB1)", () => {
  const wingedWarrior = {
    id: "10061130",
    name: "Winged Warrior",
    description:
      "Fanfare: Select another allied follower on the field and give it +1/+1.\nEvolve: Replicate the effects of this card's Fanfare ability.",
    fanfare: [
      {
        op: "stat",
        action: "give",
        target: "ally:follower",
        select: 1,
        attack: 1,
        defense: 1,
        printed:
          "Select another allied follower on the field and give it +1/+1.",
      },
    ],
    evolve: [
      {
        op: "replicate",
        zone: "fanfare",
        printed: "Replicate the effects of this card's Fanfare ability.",
      },
    ],
  };

  it("accepts literals within each marker clause", () => {
    const issues = checkPerEffectPrintedForCard({
      ...wingedWarrior,
      fanfare: [
        {
          ...wingedWarrior.fanfare[0],
          printed:
            "Fanfare: Select another allied follower on the field and give it +1/+1.",
        },
      ],
      evolve: [
        {
          ...wingedWarrior.evolve[0],
          printed:
            "Evolve: Replicate the effects of this card's Fanfare ability.",
        },
      ],
    });
    expect(issues).toHaveLength(0);
  });

  it("rejects a verbatim literal attached to the wrong marker clause", () => {
    const issues = checkPerEffectPrintedForCard({
      ...wingedWarrior,
      fanfare: [
        {
          ...wingedWarrior.fanfare[0],
          printed:
            "Fanfare: Select another allied follower on the field and give it +1/+1.",
        },
      ],
      evolve: [
        {
          ...wingedWarrior.evolve[0],
          printed:
            "Select another allied follower on the field and give it +1/+1.",
        },
      ],
    });
    expect(issues.some((i) => i.rule === "marker_consistency")).toBe(true);
    const mc = issues.find((i) => i.rule === "marker_consistency");
    expect(mc?.message).toMatch(/Evolve:/i);
  });

  it("neuter gate: disabledMarkerConsistency skips marker-consistency failures", () => {
    const issues = checkPerEffectPrintedForCard(
      {
        ...wingedWarrior,
        evolve: [
          {
            ...wingedWarrior.evolve[0],
            printed:
              "Select another allied follower on the field and give it +1/+1.",
          },
        ],
      },
      { disabledMarkerConsistency: true },
    );
    expect(issues.some((i) => i.rule === "marker_consistency")).toBe(false);
  });
});

describe("per-effect printed — multi-root resolver (DB1/DB2)", () => {
  it("resolves Leah, Bellringer Angel by marker not document order", () => {
    const leah = {
      id: "10001120",
      name: "Leah, Bellringer Angel",
      description: "Ward\nLast Words: Draw a card.\nEvolve: Draw a card.",
      evolve: [{ op: "draw", source: "deck", count: 1 }],
      superevolve: [],
      fanfare: [],
      keywords: [
        "Ward",
        {
          name: "LastWords",
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
      triggers: [],
    };
    expect(isHardMarkerMultiRootCard(leah)).toBe(true);
    const literals = multiRootPrintedLiterals(leah);
    expect(literals?.get("10001120.evolve[0]")).toBe("Evolve: Draw a card.");
    expect(literals?.get("10001120.keywords[1].effects[0]")).toBe(
      "Last Words: Draw a card.",
    );
  });

  it("maps keyword JSON names to printed markers from data", () => {
    const cards = loadCardsForGates().map(({ card }) => card);
    const report = buildKeywordNameMarkerReport(cards);
    const lastWords = report.find((r) => r.name === "LastWords");
    expect(lastWords?.printedMarkers).toContain("Last Words:");
    const spellboost = report.find((r) => r.name === "Spellboost");
    expect(spellboost?.hasPrintedMarker).toBe(false);
  });

  it("measures multi-root buckets on gate card pool", () => {
    const cards = loadCardsForGates().map(({ card }) => card);
    const buckets = measureMultiRootBuckets(cards);
    expect(buckets.multiRootCards).toBe(553);
    expect(buckets.bucketA.cards).toBe(361);
    expect(buckets.bucketB.cards).toBe(115);
    expect(buckets.bucketC.cards).toBe(77);
    // Brief cites 210; measured hard-marker bucket A is 207 (delta −3 — see PR).
    expect(buckets.hardMarkerBucketA.cards).toBe(207);
  });

  it("pins bucket C overlap examples called out in the brief", () => {
    const cards = loadCardsForGates().map(({ card }) => card);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const bullet = byId.get("10071310");
    expect(bullet).toBeDefined();
    expect(collectClauseRoots(bullet!).length).toBe(3);
    expect(splitNonKeywordSentences(bullet!.description ?? "").length).toBe(2);
  });
});
