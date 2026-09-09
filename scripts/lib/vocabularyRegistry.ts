/**
 * Declarative synonym registry — one table, one driver for settled concept spellings.
 * Replaces bespoke checks scattered through op-keys-gate.ts.
 */

import { CARD_CONDITION_KEYS } from "../../src/logic/core/conditions/evaluator.js";

export type CardJson = {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
};

export type VocabularyIssue = {
  id: string;
  name: string;
  kind: "error" | "warn";
  message: string;
  concept: string;
};

export type SpellingMatcher =
  | { kind: "top-level"; key: string; value?: unknown }
  | {
      kind: "nested";
      field: "condition" | "filter" | "filters";
      key: string;
      value?: unknown;
    }
  | { kind: "string-filter"; value: string };

export type VocabularyExemption = {
  cardIds?: string[];
  when?: (eff: Record<string, unknown>, ctx: VocabularyContext) => boolean;
  reason: string;
};

export type VocabularyRule = {
  concept: string;
  canonical: string;
  rejected: SpellingMatcher[];
  ops: "all" | string[];
  exemptions?: VocabularyExemption[];
  reason: string;
  /** When canonical is not the data majority, document why. */
  minorityNote?: string;
  buildMessage: (args: {
    card: CardJson;
    opPath: string;
    eff: Record<string, unknown>;
    matcher: SpellingMatcher;
    nestedKey?: string;
  }) => string;
};

export type VocabularyContext = {
  cardId: string;
};

export const POOL_ONLY_CONDITION_KEYS = new Set(["not_self", "include_self"]);

export const OPS_CARD_NARROWING_IN_FILTER = new Set([
  "banish",
  "select",
  "stat",
  "destroy",
  "keyword",
]);

export const POOL_SELF_INCLUSION_OPS = new Set([
  "stat",
  "keyword",
  "transform",
]);

export const GATE_EXCLUDE_SELF_CARVEOUT_CARD_IDS = new Set([
  "10501110",
  "10931110",
]);

function descSnippet(desc: string | undefined, max = 72): string {
  const one = (desc ?? "").replace(/\s+/g, " ").trim();
  if (!one) return "(no description)";
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

function matchesValue(actual: unknown, expected?: unknown): boolean {
  if (expected === undefined) return actual !== undefined;
  return actual === expected;
}

function matcherApplies(
  matcher: SpellingMatcher,
  eff: Record<string, unknown>,
): string | null {
  switch (matcher.kind) {
    case "top-level": {
      if (!matchesValue(eff[matcher.key], matcher.value)) return null;
      return matcher.key;
    }
    case "nested": {
      const container = eff[matcher.field];
      if (
        !container ||
        typeof container !== "object" ||
        Array.isArray(container)
      )
        return null;
      const obj = container as Record<string, unknown>;
      if (!matchesValue(obj[matcher.key], matcher.value)) return null;
      return matcher.key;
    }
    case "string-filter": {
      if (eff.filter !== matcher.value) return null;
      return `filter:"${matcher.value}"`;
    }
    default:
      return null;
  }
}

function ruleAppliesToOp(rule: VocabularyRule, op: string): boolean {
  return rule.ops === "all" || rule.ops.includes(op);
}

function exemptionApplies(
  rule: VocabularyRule,
  card: CardJson,
  eff: Record<string, unknown>,
): VocabularyExemption | null {
  for (const ex of rule.exemptions ?? []) {
    if (ex.cardIds?.includes(card.id)) return ex;
    if (ex.when?.(eff, { cardId: card.id })) return ex;
  }
  return null;
}

function statCardNarrowingInConditionAllowed(
  eff: Record<string, unknown>,
): boolean {
  if (eff.attack_source != null || eff.defense_source != null) return true;
  return false;
}

export const VOCABULARY_RULES: VocabularyRule[] = [
  {
    concept: "card narrowing",
    canonical: "filter.{key}",
    rejected: [{ kind: "nested", field: "condition", key: "*" }],
    ops: [...OPS_CARD_NARROWING_IN_FILTER],
    exemptions: [
      {
        when: (eff) =>
          eff.op === "stat" && statCardNarrowingInConditionAllowed(eff),
        reason:
          "stat with attack_source/defense_source: filter is the buff magnitude set, not pool narrowing (10114130 Amataz)",
      },
    ],
    reason:
      "Card-narrowing keys belong in filter; condition is for pool-only keys not_self/include_self",
    buildMessage: ({ card, opPath, eff, nestedKey }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath}.condition carries card-narrowing key "${nestedKey}" — use filter.{${nestedKey}} (condition is for pool-only keys ${[...POOL_ONLY_CONDITION_KEYS].join("/")}) — ${descSnippet(card.description)}`;
    },
  },
  {
    concept: "pool narrowing",
    canonical: "condition.{key}",
    rejected: [
      { kind: "nested", field: "filter", key: "not_self" },
      { kind: "nested", field: "filter", key: "include_self" },
    ],
    ops: [
      "stat",
      "destroy",
      "select",
      "transform",
      "attacks_per_turn",
      "keyword",
      "damage",
      "banish",
      "summon",
      "return",
      "cost",
      "evolve",
      "evolve_self",
      "super_evolve_self",
      "add_to_hand",
      "repeat_effect",
      "countdown",
      "deck",
    ],
    exemptions: [
      {
        when: (eff) => eff.op === "repeat_effect",
        reason: "repeat_effect.filter is a repeat count, not pool narrowing",
      },
      {
        when: (eff) => eff.op === "countdown",
        reason: "countdown aliases filter into board_name, not pool narrowing",
      },
      {
        when: (eff) =>
          ["summon", "add_to_hand", "deck"].includes(String(eff.op)) &&
          eff.source === "destroyed_match",
        reason:
          "summon/add_to_hand/deck with source:destroyed_match filter a history log, not a live zone",
      },
      {
        when: (eff) =>
          eff.op === "summon" &&
          ["hand", "graveyard"].includes(String(eff.source ?? "")),
        reason:
          "summon from hand/graveyard uses filter.type as a dispatch discriminant",
      },
      {
        when: (eff) =>
          eff.op === "stat" &&
          (eff.attack_source != null || eff.defense_source != null),
        reason:
          "stat with attack_source/defense_source: filter is the buff magnitude set (10114130 Amataz)",
      },
    ],
    reason:
      "Pool-only keys not_self/include_self belong in condition, not filter",
    buildMessage: ({ card, opPath, eff, nestedKey }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath}.filter carries pool-only key "${nestedKey}" — use condition.{${nestedKey}} (filter is for card-narrowing keys) — ${descSnippet(card.description)}`;
    },
  },
  {
    concept: "self-inclusion (exclude)",
    canonical: "condition.not_self:true",
    rejected: [{ kind: "top-level", key: "exclude_self", value: true }],
    ops: [...POOL_SELF_INCLUSION_OPS],
    reason: "Pool self-exclusion uses condition.not_self:true",
    buildMessage: ({ card, opPath, eff }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath} uses top-level "exclude_self" — use condition.not_self:true (pool narrowing) — ${descSnippet(card.description)}`;
    },
  },
  {
    concept: "self-inclusion (include)",
    canonical: "condition.include_self:true",
    rejected: [{ kind: "top-level", key: "include_self", value: true }],
    ops: [...POOL_SELF_INCLUSION_OPS],
    reason: "Pool self-inclusion uses condition.include_self:true",
    buildMessage: ({ card, opPath, eff }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath} uses top-level "include_self" — use condition.include_self:true (pool narrowing) — ${descSnippet(card.description)}`;
    },
  },
  {
    concept: "self-inclusion (include) — not_self:false",
    canonical: "condition.include_self:true",
    rejected: [
      { kind: "nested", field: "condition", key: "not_self", value: false },
    ],
    ops: "all",
    reason:
      "not_self:false means include self — use condition.include_self:true",
    buildMessage: ({ card, opPath, eff }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath}.condition uses not_self:false — use condition.include_self:true — ${descSnippet(card.description)}`;
    },
  },
  {
    concept: "gate exclude_self carve-out",
    canonical: "top-level exclude_self (named_enter_count only)",
    rejected: [{ kind: "top-level", key: "exclude_self", value: true }],
    ops: ["gate"],
    exemptions: [
      {
        cardIds: [...GATE_EXCLUDE_SELF_CARVEOUT_CARD_IDS],
        reason:
          "exclude_self on gate is named_enter_count counting (other copies), not pool narrowing — 10501110, 10931110",
      },
    ],
    reason: "gate exclude_self outside documented carve-out is unsupported",
    minorityNote:
      "Canonical top-level exclude_self on gate applies only to carve-out cards (named_enter_count); all other gate ops must not use it",
    buildMessage: ({ card, opPath, eff }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath} uses top-level "exclude_self" outside documented gate carve-out (10501110 Monster Litterateur, 10931110 Obsessed Test Subject) — ${descSnippet(card.description)}`;
    },
  },
  {
    concept: 'stat "until end of turn"',
    canonical: 'duration:"turn_end"',
    rejected: [{ kind: "top-level", key: "until_end_of_turn", value: true }],
    ops: ["stat"],
    reason: 'Temporary stat buffs use duration:"turn_end"',
    buildMessage: ({ card, opPath }) =>
      `stat op at ${opPath} uses until_end_of_turn:true — use duration:"turn_end" — ${descSnippet(card.description)}`,
  },
  {
    concept: "single selection",
    canonical: "select:1",
    rejected: [{ kind: "top-level", key: "select", value: true }],
    ops: "all",
    reason: "Boolean select:true is ambiguous — use select:1",
    buildMessage: ({ card, opPath, eff }) =>
      `${String(eff.op)} op at ${opPath} uses select:true — use select:1 — ${descSnippet(card.description)}`,
  },
  {
    concept: "positional selector",
    canonical: 'distribution:"leftmost"',
    rejected: [{ kind: "string-filter", value: "leftmost" }],
    ops: ["stat", "select", "summon", "destroy", "banish", "damage", "return"],
    reason:
      'Positional selection uses distribution:"leftmost", not filter:"leftmost"',
    buildMessage: ({ card, opPath, eff }) => {
      const op = String(eff.op);
      return `${op} op at ${opPath} uses filter:"leftmost" — use distribution:"leftmost" — ${descSnippet(card.description)}`;
    },
  },
];

function expandWildcardMatcher(
  matcher: SpellingMatcher,
  eff: Record<string, unknown>,
): SpellingMatcher[] {
  if (
    matcher.kind === "nested" &&
    matcher.key === "*" &&
    matcher.field === "condition"
  ) {
    const cond = eff.condition;
    if (!cond || typeof cond !== "object" || Array.isArray(cond)) return [];
    return Object.keys(cond as Record<string, unknown>)
      .filter((k) => CARD_CONDITION_KEYS.has(k))
      .map((k) => ({
        kind: "nested" as const,
        field: "condition" as const,
        key: k,
      }));
  }
  return [matcher];
}

export function checkVocabularyForEffectWithRules(
  card: CardJson,
  opPath: string,
  eff: Record<string, unknown>,
  rules: VocabularyRule[] = VOCABULARY_RULES,
): VocabularyIssue[] {
  const issues: VocabularyIssue[] = [];
  const op = String(eff.op);

  for (const rule of rules) {
    if (!ruleAppliesToOp(rule, op)) continue;
    const exemption = exemptionApplies(rule, card, eff);
    if (exemption) continue;

    for (const rawMatcher of rule.rejected) {
      for (const matcher of expandWildcardMatcher(rawMatcher, eff)) {
        const hit = matcherApplies(matcher, eff);
        if (!hit) continue;
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          concept: rule.concept,
          message: rule.buildMessage({
            card,
            opPath,
            eff,
            matcher,
            nestedKey: hit,
          }),
        });
      }
    }
  }

  return issues;
}

export function checkVocabularyForEffect(
  card: CardJson,
  opPath: string,
  eff: Record<string, unknown>,
): VocabularyIssue[] {
  return checkVocabularyForEffectWithRules(card, opPath, eff);
}

/** Registry-documented top-level keys (canonical spellings) for vocabulary report. */
export function registryDocumentedTopLevelKeys(): Set<string> {
  const keys = new Set<string>();
  for (const rule of VOCABULARY_RULES) {
    for (const matcher of rule.rejected) {
      if (matcher.kind === "top-level") keys.add(matcher.key);
    }
    const canonicalMatch = rule.canonical.match(/^([^.:]+)/);
    if (canonicalMatch) keys.add(canonicalMatch[1]!);
  }
  keys.add("duration");
  keys.add("distribution");
  keys.add("condition");
  keys.add("filter");
  return keys;
}

const STAT_NAME_VALUE_SOURCES = new Set(["named_enter_count"]);

function statNameAllowed(eff: Record<string, unknown>): boolean {
  const atkSrc = String(eff.attack_source ?? "").toLowerCase();
  const defSrc = String(eff.defense_source ?? "").toLowerCase();
  return (
    STAT_NAME_VALUE_SOURCES.has(atkSrc) || STAT_NAME_VALUE_SOURCES.has(defSrc)
  );
}

/** Top-level keys legal only under a documented predicate (mirrors op-keys-gate carve-outs). */
export type ConditionalDocumentedKey = {
  op: string;
  key: string;
  canonical: string;
  condition: string;
  reason: string;
  when: (eff: Record<string, unknown>) => boolean;
};

export const CONDITIONAL_DOCUMENTED_TOP_LEVEL_KEYS: ConditionalDocumentedKey[] =
  [
    {
      op: "stat",
      key: "name",
      canonical: "name",
      condition:
        "attack_source or defense_source is named_enter_count (same predicate as op-keys-gate statNameAllowed)",
      reason:
        "Names the card whose allied copies are counted — required for named_enter_count buffs (10844110 Drache & Aluzard, Burning Blood)",
      when: statNameAllowed,
    },
  ];

export function conditionalDocumentedTopLevelKey(
  op: string,
  key: string,
  conditionalKeys: ConditionalDocumentedKey[] = CONDITIONAL_DOCUMENTED_TOP_LEVEL_KEYS,
): ConditionalDocumentedKey | undefined {
  return conditionalKeys.find((d) => d.op === op && d.key === key);
}
