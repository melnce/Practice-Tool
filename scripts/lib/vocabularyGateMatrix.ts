/**
 * Gate enforcement matrix — every registry op × every rejected-shape probe.
 * Committed snapshot pins "same enforcement, one table".
 */

import { checkOpKeysForCard } from "../op-keys-gate.js";
import {
  checkVocabularyForEffectWithRules,
  type VocabularyRule,
} from "./vocabularyRegistry.js";
import { VOCABULARY_RULES } from "./vocabularyRegistry.js";

export type MatrixProbe = {
  field: "filter" | "condition" | "top-level" | "filter-string";
  key: string;
  effectPatch: Record<string, unknown>;
};

export type MatrixRow = {
  op: string;
  field: string;
  key: string;
  errored: boolean;
  concepts: string[];
};

const BASE_CARD = {
  id: "99999999",
  name: "Matrix Probe",
  type: "Follower",
  class: "Neutral",
  cost: "0",
  description: "matrix probe",
};

/** Every op named in any registry rule's `ops` list. */
export function collectRegistryOps(
  rules: VocabularyRule[] = VOCABULARY_RULES,
): string[] {
  const ops = new Set<string>();
  for (const rule of rules) {
    if (rule.ops === "all") continue;
    for (const op of rule.ops) ops.add(op);
  }
  return [...ops].sort();
}

export const MATRIX_PROBES: MatrixProbe[] = [
  {
    field: "filter",
    key: "not_self",
    effectPatch: { filter: { not_self: true } },
  },
  {
    field: "filter",
    key: "include_self",
    effectPatch: { filter: { include_self: true } },
  },
  {
    field: "condition",
    key: "not_self:false",
    effectPatch: { condition: { not_self: false } },
  },
  {
    field: "top-level",
    key: "exclude_self",
    effectPatch: { exclude_self: true },
  },
  {
    field: "top-level",
    key: "include_self",
    effectPatch: { include_self: true },
  },
  {
    field: "top-level",
    key: "until_end_of_turn",
    effectPatch: { until_end_of_turn: true },
  },
  {
    field: "top-level",
    key: "select:true",
    effectPatch: { select: true },
  },
  {
    field: "filter-string",
    key: "leftmost",
    effectPatch: { filter: "leftmost" },
  },
];

function minimalEffectForOp(op: string): Record<string, unknown> {
  switch (op) {
    case "damage":
      return { op, target: "enemy:follower", amount: 1 };
    case "destroy":
      return { op, target: "enemy:follower" };
    case "stat":
      return { op, action: "give", target: "ally:follower", attack: 1 };
    case "keyword":
      return {
        op,
        action: "grant",
        target: "ally:follower",
        keywords: ["Barrier"],
      };
    case "gate":
      return { op, condition: "field_matches", effects: [] };
    case "summon":
      return { op, source: "hand", name: "Goblin" };
    case "deck":
      return { op, action: "draw", count: 1 };
    case "repeat_effect":
      return { op, count: 1, effects: [] };
    case "countdown":
      return { op, action: "delay", board_name: "Test" };
    default:
      return { op, target: "ally:follower" };
  }
}

export function buildGateMatrix(
  rules: VocabularyRule[] = VOCABULARY_RULES,
): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const ops = collectRegistryOps(rules);

  for (const op of ops) {
    for (const probe of MATRIX_PROBES) {
      const eff = {
        ...minimalEffectForOp(op),
        ...probe.effectPatch,
      };
      const card = { ...BASE_CARD, fanfare: [eff] };
      const opPath = `${BASE_CARD.id}.fanfare[0]`;
      const vocabIssues = checkVocabularyForEffectWithRules(
        card,
        opPath,
        eff,
        rules,
      );
      const gateIssues = checkOpKeysForCard(card, { vocabularyRules: rules });
      const vocabMessages = new Set(vocabIssues.map((v) => v.message));
      const errored = gateIssues.some((i) => vocabMessages.has(i.message));

      rows.push({
        op,
        field: probe.field,
        key: probe.key,
        errored,
        concepts: [...new Set(vocabIssues.map((v) => v.concept))].sort(),
      });
    }
  }

  return rows;
}

export function formatGateMatrix(rows: MatrixRow[]): string {
  const lines = [
    "# Vocabulary gate enforcement matrix",
    "# op | field | key | errored | concept(s)",
    "",
  ];
  for (const row of rows) {
    lines.push(
      `${row.op}|${row.field}|${row.key}|${row.errored}|${row.concepts.join(";")}`,
    );
  }
  return lines.join("\n");
}

export function diffMatrixRows(
  before: MatrixRow[],
  after: MatrixRow[],
): number {
  const key = (r: MatrixRow) => `${r.op}|${r.field}|${r.key}`;
  const beforeMap = new Map(before.map((r) => [key(r), r]));
  let flipped = 0;
  for (const row of after) {
    const prev = beforeMap.get(key(row));
    if (!prev) {
      flipped++;
      continue;
    }
    if (prev.errored !== row.errored) flipped++;
    else if (prev.concepts.join(";") !== row.concepts.join(";")) flipped++;
  }
  return flipped;
}
