/**
 * Values gate — every `{...}` template literal in card data must be recognized.
 */

import type { CardJson } from "./lib/loadCards.js";
import { isRecognizedDynamicTemplate } from "../src/logic/core/values.js";

export type ValuesGateIssue = {
  cardId: string;
  cardName: string;
  jsonPath: string;
  template: string;
  message: string;
};

const TEMPLATE_RE = /^\{[^}]+\}$/;

function walkTemplates(
  node: unknown,
  card: CardJson,
  visitor: (template: string, jsonPath: string) => void,
  pathPrefix = "",
): void {
  if (typeof node === "string") {
    if (TEMPLATE_RE.test(node.trim())) {
      visitor(node.trim(), pathPrefix || card.id);
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      walkTemplates(child, card, visitor, `${pathPrefix}[${index}]`);
    });
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    walkTemplates(value, card, visitor, childPath);
  }
}

export function checkValuesForCard(card: CardJson): ValuesGateIssue[] {
  const issues: ValuesGateIssue[] = [];
  walkTemplates(card, card, (template, jsonPath) => {
    if (!isRecognizedDynamicTemplate(template)) {
      issues.push({
        cardId: card.id,
        cardName: card.name,
        jsonPath,
        template,
        message: `unrecognized value template "${template}" at ${jsonPath}`,
      });
    }
  });
  return issues;
}

export type ValuesGateReport = {
  issues: ValuesGateIssue[];
  census: {
    distinctTemplates: number;
    totalUses: number;
    templates: Array<{ template: string; count: number }>;
  };
  exitCode: number;
};

export function runValuesGate(cards: CardJson[]): ValuesGateReport {
  const counts = new Map<string, number>();
  const issues: ValuesGateIssue[] = [];

  for (const card of cards) {
    issues.push(...checkValuesForCard(card));
    walkTemplates(card, card, (template) => {
      counts.set(template, (counts.get(template) ?? 0) + 1);
    });
  }

  const templates = [...counts.entries()]
    .map(([template, count]) => ({ template, count }))
    .sort((a, b) => a.template.localeCompare(b.template));

  const totalUses = templates.reduce((sum, row) => sum + row.count, 0);

  return {
    issues,
    census: {
      distinctTemplates: templates.length,
      totalUses,
      templates,
    },
    exitCode: issues.length > 0 ? 1 : 0,
  };
}
