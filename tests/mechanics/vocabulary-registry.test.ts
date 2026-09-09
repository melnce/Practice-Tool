import { describe, it, expect } from "vitest";
import { VOCABULARY_RULES } from "../../scripts/lib/vocabularyRegistry.js";
import { checkOpKeysForCard } from "../../scripts/op-keys-gate.js";
import { auditVocabularyRegistry } from "../../scripts/lib/vocabularyAudit.js";
import { loadAllCardDataEntries } from "../../scripts/lib/loadAllCardData.js";
import {
  buildGateMatrix,
  formatGateMatrix,
  diffMatrixRows,
} from "../../scripts/lib/vocabularyGateMatrix.js";
import fs from "fs";
import path from "path";

const base = {
  id: "99999990",
  name: "Vocab Sabotage",
  type: "Follower",
  class: "Neutral",
  cost: "0",
  description: "test card",
};

type SabotageCase = {
  concept: string;
  card: Record<string, unknown>;
  messagePart: string;
};

const sabotageCases: SabotageCase[] = [
  {
    concept: "card narrowing",
    card: {
      ...base,
      fanfare: [
        {
          op: "destroy",
          target: "enemy:follower",
          condition: { tribe: "Pixie" },
        },
      ],
    },
    messagePart: "card-narrowing",
  },
  {
    concept: "pool narrowing",
    card: {
      ...base,
      fanfare: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 1,
          filter: { not_self: true },
        },
      ],
    },
    messagePart: "pool-only",
  },
  {
    concept: "self-inclusion (exclude)",
    card: {
      ...base,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          exclude_self: true,
        },
      ],
    },
    messagePart: 'top-level "exclude_self"',
  },
  {
    concept: "self-inclusion (include)",
    card: {
      ...base,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          include_self: true,
        },
      ],
    },
    messagePart: 'top-level "include_self"',
  },
  {
    concept: "self-inclusion (include) — not_self:false",
    card: {
      ...base,
      fanfare: [
        {
          op: "damage",
          target: "all:follower",
          amount: 2,
          condition: { not_self: false },
        },
      ],
    },
    messagePart: "not_self:false",
  },
  {
    concept: "gate exclude_self carve-out",
    card: {
      ...base,
      id: "99999991",
      fanfare: [
        {
          op: "gate",
          condition: "field_matches",
          exclude_self: true,
          effects: [],
        },
      ],
    },
    messagePart: "outside documented gate carve-out",
  },
  {
    concept: 'stat "until end of turn"',
    card: {
      ...base,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack: 1,
          until_end_of_turn: true,
        },
      ],
    },
    messagePart: 'duration:"turn_end"',
  },
  {
    concept: "single selection",
    card: {
      ...base,
      fanfare: [{ op: "summon", source: "hand", select: true }],
    },
    messagePart: "select:true",
  },
  {
    concept: "positional selector",
    card: {
      ...base,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          filter: "leftmost",
          attack: 1,
        },
      ],
    },
    messagePart: 'filter:"leftmost"',
  },
];

function gateMessages(
  card: Record<string, unknown>,
  vocabularyRules?: typeof VOCABULARY_RULES,
): string[] {
  return checkOpKeysForCard(
    card as Parameters<typeof checkOpKeysForCard>[0],
    vocabularyRules ? { vocabularyRules } : undefined,
  ).map((i) => i.message);
}

describe("vocabulary registry — one sabotage case per rule", () => {
  it("has exactly one sabotage case per registry rule", () => {
    expect(sabotageCases.length).toBe(VOCABULARY_RULES.length);
    for (const rule of VOCABULARY_RULES) {
      expect(sabotageCases.some((c) => c.concept === rule.concept)).toBe(true);
    }
  });

  for (const { concept, card, messagePart } of sabotageCases) {
    it(`flags ${concept}`, () => {
      const messages = gateMessages(card);
      expect(messages.some((m) => m.includes(messagePart))).toBe(true);
    });
  }

  for (const { concept, card, messagePart } of sabotageCases) {
    it(`neuter gate: removing "${concept}" drops its message`, () => {
      const full = gateMessages(card).filter((m) => m.includes(messagePart));
      const neutered = gateMessages(
        card,
        VOCABULARY_RULES.filter((r) => r.concept !== concept),
      ).filter((m) => m.includes(messagePart));
      expect(full.length).toBeGreaterThan(0);
      expect(neutered.length).toBe(0);
    });
  }
});

describe("vocabulary registry — probe table A–G", () => {
  function probeCount(eff: Record<string, unknown>): number {
    const card = {
      ...base,
      fanfare: [eff],
    };
    return checkOpKeysForCard(card as Parameters<typeof checkOpKeysForCard>[0])
      .length;
  }

  it("A damage filter not_self → 1", () => {
    expect(
      probeCount({
        op: "damage",
        target: "enemy:follower",
        amount: 1,
        filter: { not_self: true },
      }),
    ).toBe(1);
  });

  it("B damage filter include_self → 1", () => {
    expect(
      probeCount({
        op: "damage",
        target: "enemy:follower",
        amount: 1,
        filter: { include_self: true },
      }),
    ).toBe(1);
  });

  it("C destroy filter not_self → 1 (control)", () => {
    expect(
      probeCount({
        op: "destroy",
        target: "ally:follower",
        filter: { not_self: true },
      }),
    ).toBe(1);
  });

  it("D stat filter not_self → 1 (not duplicated)", () => {
    const card = {
      ...base,
      fanfare: [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          filter: { not_self: true },
        },
      ],
    };
    const issues = checkOpKeysForCard(
      card as Parameters<typeof checkOpKeysForCard>[0],
    );
    const poolOnly = issues.filter((i) => i.message.includes("pool-only"));
    expect(poolOnly).toHaveLength(1);
  });

  it("E stat filter leftmost → 1", () => {
    expect(
      probeCount({
        op: "stat",
        action: "give",
        target: "ally:follower",
        filter: "leftmost",
        attack: 1,
      }),
    ).toBe(1);
  });

  it("F stat filter leftmost + distribution leftmost → 1", () => {
    expect(
      probeCount({
        op: "stat",
        action: "give",
        target: "ally:follower",
        filter: "leftmost",
        distribution: "leftmost",
        attack: 1,
      }),
    ).toBe(1);
  });

  it("G gate exclude_self non-carve-out → 1 (control)", () => {
    expect(
      probeCount({
        op: "gate",
        condition: "field_matches",
        exclude_self: true,
        effects: [],
      }),
    ).toBe(1);
  });

  it("Knightly Ardor shape still passes", () => {
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
    const leftmost = issues.filter((i) =>
      i.message.includes('filter:"leftmost"'),
    );
    expect(leftmost).toHaveLength(0);
  });
});

describe("vocabulary registry — gate enforcement matrix (BU1 pin)", () => {
  const MATRIX_FIXTURE = path.join(
    import.meta.dirname,
    "../fixtures/vocabulary/gate-matrix.snapshot.txt",
  );

  it("matches committed gate matrix snapshot", () => {
    const rows = buildGateMatrix();
    const text = formatGateMatrix(rows);
    const expected = fs.readFileSync(MATRIX_FIXTURE, "utf-8");
    expect(text).toBe(expected);
  });
});

describe("vocabulary registry — self-audit (BU2)", () => {
  it("no rejected spelling in the three card-data files", () => {
    const entries = loadAllCardDataEntries();
    expect(entries.length).toBeGreaterThan(0);
    const audit = auditVocabularyRegistry(entries);
    expect(audit.rejectedHits).toHaveLength(0);
  });

  it("canonical spellings are majority or carry minorityNote", () => {
    const audit = auditVocabularyRegistry();
    const minorityErrors = audit.errors.filter((e) =>
      e.includes("not majority"),
    );
    expect(minorityErrors).toHaveLength(0);
  });

  it("exemptions with cardIds are load-bearing", () => {
    const audit = auditVocabularyRegistry();
    const staleErrors = audit.errors.filter((e) =>
      e.includes("Stale exemption"),
    );
    expect(staleErrors).toHaveLength(0);
  });

  it("gate carve-out cards still carry exclude_self", () => {
    const audit = auditVocabularyRegistry();
    const gateEx = audit.exemptionAudit.find(
      (e) => e.rule === "gate exclude_self carve-out",
    );
    expect(gateEx?.loadBearing).toContain("10501110");
    expect(gateEx?.loadBearing).toContain("10931110");
  });
});

describe("vocabulary registry — pool narrowing exemptions are reachable", () => {
  it("repeat_effect, countdown, and deck are in pool narrowing ops", () => {
    const poolRule = VOCABULARY_RULES.find(
      (r) => r.concept === "pool narrowing",
    );
    expect(poolRule?.ops).toContain("repeat_effect");
    expect(poolRule?.ops).toContain("countdown");
    expect(poolRule?.ops).toContain("deck");
  });

  it("damage is not exempt from pool-only keys in filter", () => {
    const poolRule = VOCABULARY_RULES.find(
      (r) => r.concept === "pool narrowing",
    );
    const damageExempt = poolRule?.exemptions?.some(
      (e) => e.when?.({ op: "damage" }, { cardId: "test" }) ?? false,
    );
    expect(damageExempt).toBeFalsy();
  });
});
