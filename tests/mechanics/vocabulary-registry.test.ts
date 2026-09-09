import { describe, it, expect } from "vitest";
import {
  VOCABULARY_RULES,
  checkVocabularyForEffect,
  checkVocabularyForEffectWithRules,
} from "../../scripts/lib/vocabularyRegistry.js";
import { checkOpKeysForCard } from "../../scripts/op-keys-gate.js";
import { auditVocabularyRegistry } from "../../scripts/lib/vocabularyAudit.js";
import { loadAllCardDataEntries } from "../../scripts/lib/loadAllCardData.js";

const base = {
  id: "99999990",
  name: "Vocab Sabotage",
  type: "Follower",
  class: "Neutral",
  cost: "0",
  description: "test card",
};

describe("vocabulary registry — sabotage cards go red", () => {
  const sabotageCases: Array<{
    concept: string;
    card: Record<string, unknown>;
    opPath: string;
    eff: Record<string, unknown>;
    messagePart: string;
  }> = [
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
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "destroy",
        target: "enemy:follower",
        condition: { tribe: "Pixie" },
      },
      messagePart: "card-narrowing",
    },
    {
      concept: "pool narrowing",
      card: {
        ...base,
        fanfare: [
          {
            op: "destroy",
            target: "ally:follower",
            filter: { not_self: true },
          },
        ],
      },
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "destroy",
        target: "ally:follower",
        filter: { not_self: true },
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
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "stat",
        action: "give",
        target: "ally:follower",
        exclude_self: true,
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
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "stat",
        action: "give",
        target: "ally:follower",
        include_self: true,
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
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "damage",
        target: "all:follower",
        amount: 2,
        condition: { not_self: false },
      },
      messagePart: "not_self:false",
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
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "stat",
        action: "give",
        target: "self",
        attack: 1,
        until_end_of_turn: true,
      },
      messagePart: 'duration:"turn_end"',
    },
    {
      concept: "single selection",
      card: {
        ...base,
        fanfare: [{ op: "summon", source: "hand", select: true }],
      },
      opPath: `${base.id}.fanfare[0]`,
      eff: { op: "summon", source: "hand", select: true },
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
      opPath: `${base.id}.fanfare[0]`,
      eff: {
        op: "stat",
        action: "give",
        target: "ally:follower",
        filter: "leftmost",
        attack: 1,
      },
      messagePart: 'filter:"leftmost"',
    },
  ];

  for (const { concept, card, messagePart } of sabotageCases) {
    it(`flags ${concept}`, () => {
      const issues = checkOpKeysForCard(
        card as Parameters<typeof checkOpKeysForCard>[0],
      );
      expect(issues.some((i) => i.message.includes(messagePart))).toBe(true);
    });
  }

  it("neuter counts: removing each rule drops its reds to zero", () => {
    const measured: Record<string, { full: number; neutered: number }> = {};

    for (const { concept, card, opPath, eff } of sabotageCases) {
      const cardJson = card as Parameters<typeof checkVocabularyForEffect>[0];
      const full = checkVocabularyForEffect(cardJson, opPath, eff).filter(
        (i) => i.concept === concept,
      ).length;

      const neutered = checkVocabularyForEffectWithRules(
        cardJson,
        opPath,
        eff,
        VOCABULARY_RULES.filter((r) => r.concept !== concept),
      ).filter((i) => i.concept === concept).length;

      measured[concept] = { full, neutered };
      expect(full).toBeGreaterThan(0);
      expect(neutered).toBe(0);
    }

    // Measured neuter table (full → neutered must move)
    expect(Object.keys(measured).length).toBe(sabotageCases.length);
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

describe("vocabulary registry — poolCondition excluded ops completeness", () => {
  it("documents damage, repeat_effect, countdown, destroyed_match exemptions", () => {
    const poolRule = VOCABULARY_RULES.find(
      (r) => r.concept === "pool narrowing",
    );
    expect(poolRule).toBeDefined();
    const reasons = (poolRule?.exemptions ?? []).map((e) => e.reason).join(" ");
    expect(reasons).toMatch(/damage/i);
    expect(reasons).toMatch(/repeat_effect/i);
    expect(reasons).toMatch(/countdown/i);
    expect(reasons).toMatch(/destroyed_match/i);
    expect(reasons).toMatch(/hand\/graveyard/i);
    expect(reasons).toMatch(/attack_source/i);
  });
});
