/**
 * Self-audit for the vocabulary registry against live card data.
 */

import { collectOpsInTree } from "../op-keys-gate.js";
import { loadUniqueCardsById, type CardDataEntry } from "./loadAllCardData.js";
import { CARD_CONDITION_KEYS } from "../../src/logic/core/conditions/evaluator.js";
import {
  VOCABULARY_RULES,
  type SpellingMatcher,
  type VocabularyRule,
  checkVocabularyForEffect,
} from "./vocabularyRegistry.js";

export type SpellingHit = {
  rule: string;
  cardId: string;
  cardName: string;
  opPath: string;
  op: string;
  sourceFile: string;
};

export type CanonicalCount = {
  rule: string;
  canonical: string;
  canonicalCount: number;
  rejectedCount: number;
  minorityNote?: string;
};

export type ExemptionAudit = {
  rule: string;
  reason: string;
  cardIds: string[];
  stale: string[];
  loadBearing: string[];
};

export type VocabularyAuditReport = {
  rejectedHits: SpellingHit[];
  canonicalCounts: CanonicalCount[];
  exemptionAudit: ExemptionAudit[];
  errors: string[];
};

function countCanonicalVsRejected(
  entries: Iterable<CardDataEntry>,
  rule: VocabularyRule,
): { canonical: number; rejected: number } {
  let canonical = 0;
  let rejected = 0;

  for (const { card } of entries) {
    const found: { path: string; eff: Record<string, unknown> }[] = [];
    collectOpsInTree(card, card.id, found);
    for (const { path: opPath, eff } of found) {
      const violations = checkVocabularyForEffect(card, opPath, eff).filter(
        (i) => i.concept === rule.concept,
      );
      rejected += violations.length;
      canonical += countCanonicalForRule(rule, card, eff);
    }
  }

  return { canonical, rejected };
}

function countCanonicalForRule(
  rule: VocabularyRule,
  card: { id: string },
  eff: Record<string, unknown>,
): number {
  const op = String(eff.op);
  if (rule.ops !== "all" && !rule.ops.includes(op)) return 0;

  switch (rule.concept) {
    case "card narrowing": {
      const f = eff.filter;
      if (!f || typeof f !== "object" || Array.isArray(f)) return 0;
      return Object.keys(f as object).filter((k) => CARD_CONDITION_KEYS.has(k))
        .length;
    }
    case "pool narrowing": {
      const c = eff.condition;
      if (!c || typeof c !== "object" || Array.isArray(c)) return 0;
      const obj = c as Record<string, unknown>;
      return (obj.not_self ? 1 : 0) + (obj.include_self ? 1 : 0);
    }
    case "self-inclusion (exclude)": {
      const c = eff.condition;
      if (c && typeof c === "object" && (c as { not_self?: boolean }).not_self)
        return 1;
      return 0;
    }
    case "self-inclusion (include)":
    case "self-inclusion (include) — not_self:false": {
      const c = eff.condition;
      if (
        c &&
        typeof c === "object" &&
        (c as { include_self?: boolean }).include_self
      )
        return 1;
      return 0;
    }
    case "gate exclude_self carve-out":
      if (op === "gate" && eff.exclude_self === true) return 1;
      return 0;
    case 'stat "until end of turn"':
      if (eff.duration === "turn_end" || eff.duration === "opponent_turn_end")
        return 1;
      return 0;
    case "single selection":
      if (typeof eff.select === "number") return 1;
      return 0;
    case "positional selector":
      if (eff.distribution === "leftmost") return 1;
      return 0;
    default:
      return 0;
  }
}

export function auditVocabularyRegistry(
  entries: Map<string, CardDataEntry> = loadUniqueCardsById(),
): VocabularyAuditReport {
  const rejectedHits: SpellingHit[] = [];
  const errors: string[] = [];
  const canonicalCounts: CanonicalCount[] = [];
  const exemptionAudit: ExemptionAudit[] = [];

  for (const { card, sourceFile } of entries.values()) {
    const found: { path: string; eff: Record<string, unknown> }[] = [];
    collectOpsInTree(card, card.id, found);
    for (const { path: opPath, eff } of found) {
      const issues = checkVocabularyForEffect(card, opPath, eff);
      for (const issue of issues) {
        rejectedHits.push({
          rule: issue.concept,
          cardId: card.id,
          cardName: card.name,
          opPath,
          op: String(eff.op),
          sourceFile,
        });
      }
    }
  }

  if (rejectedHits.length > 0) {
    errors.push(
      `${rejectedHits.length} rejected spelling(s) found in card data`,
    );
  }

  for (const rule of VOCABULARY_RULES) {
    const { canonical, rejected } = countCanonicalVsRejected(
      entries.values(),
      rule,
    );
    canonicalCounts.push({
      rule: rule.concept,
      canonical: rule.canonical,
      canonicalCount: canonical,
      rejectedCount: rejected,
      minorityNote: rule.minorityNote,
    });

    if (
      canonical + rejected > 0 &&
      canonical < rejected &&
      !rule.minorityNote
    ) {
      errors.push(
        `Rule "${rule.concept}": canonical (${canonical}) is not majority vs rejected (${rejected}) and has no minorityNote`,
      );
    }

    for (const ex of rule.exemptions ?? []) {
      const cardIds = ex.cardIds ?? [];
      if (!cardIds.length && !ex.when) continue;

      const stale: string[] = [];
      const loadBearing: string[] = [];

      if (cardIds.length) {
        for (const cardId of cardIds) {
          const entry = entries.get(cardId);
          if (!entry) {
            stale.push(cardId);
            continue;
          }
          const found: { path: string; eff: Record<string, unknown> }[] = [];
          collectOpsInTree(entry.card, entry.card.id, found);
          let stillMatches = false;
          for (const { eff } of found) {
            if (!ruleApplies(rule, String(eff.op))) continue;
            for (const matcher of rule.rejected) {
              if (matcherAppliesSimple(matcher, eff)) stillMatches = true;
            }
          }
          if (stillMatches) loadBearing.push(cardId);
          else stale.push(cardId);
        }
      }

      exemptionAudit.push({
        rule: rule.concept,
        reason: ex.reason,
        cardIds,
        stale,
        loadBearing,
      });

      if (stale.length > 0) {
        errors.push(
          `Stale exemption on "${rule.concept}" for card(s) ${stale.join(", ")}: ${ex.reason}`,
        );
      }
    }
  }

  return { rejectedHits, canonicalCounts, exemptionAudit, errors };
}

function ruleApplies(rule: VocabularyRule, op: string): boolean {
  return rule.ops === "all" || rule.ops.includes(op);
}

function matcherAppliesSimple(
  matcher: SpellingMatcher,
  eff: Record<string, unknown>,
): boolean {
  if (matcher.kind === "top-level") {
    return (
      eff[matcher.key] !== undefined &&
      (matcher.value === undefined || eff[matcher.key] === matcher.value)
    );
  }
  if (matcher.kind === "nested") {
    const c = eff[matcher.field];
    if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    const obj = c as Record<string, unknown>;
    return (
      obj[matcher.key] !== undefined &&
      (matcher.value === undefined || obj[matcher.key] === matcher.value)
    );
  }
  if (matcher.kind === "string-filter") return eff.filter === matcher.value;
  return false;
}
