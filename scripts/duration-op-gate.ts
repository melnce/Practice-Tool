/**
 * Duration-key gate — flags duration-style keys on ops whose handlers ignore them.
 * Allowlists derived from engine consumption paths (not from current card data).
 */

export type CardJson = {
  id: string;
  name: string;
  description?: string;
};

export type DurationGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

/** Ops that honour `until_eot` (stat/duration.ts, cost/unified.ts, attacks.ts). */
const UNTIL_EOT_OPS = new Set(["stat", "cost", "attacks_per_turn"]);

/** Ops that honour `until_end_of_turn` (stat, attacks, keyword grant). */
const UNTIL_END_OF_TURN_OPS = new Set(["stat", "attacks_per_turn", "keyword"]);

/** Ops that honour string `duration` (stat/core keyword grant path; keyword grant). */
const DURATION_FIELD_OPS = new Set(["stat", "keyword"]);

function walkEffectNodes(
  node: unknown,
  visitor: (obj: Record<string, unknown>, path: string) => void,
  path = "",
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => walkEffectNodes(n, visitor, `${path}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.op === "string") {
    visitor(obj, path);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    walkEffectNodes(v, visitor, path ? `${path}.${k}` : k);
  }
}

export function checkDurationOpKeysForCard(
  card: CardJson,
): DurationGateIssue[] {
  const issues: DurationGateIssue[] = [];
  walkEffectNodes(card, (eff, opPath) => {
    const op = String(eff.op);
    const fullPath = opPath || card.id;

    if (eff.until_eot === true && !UNTIL_EOT_OPS.has(op)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${op} op at ${fullPath} uses "until_eot" (ignored by engine for this op type) — only stat, cost, and attacks_per_turn honour until_eot`,
      });
    }

    if (eff.until_end_of_turn === true && !UNTIL_END_OF_TURN_OPS.has(op)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${op} op at ${fullPath} uses "until_end_of_turn" (ignored by engine for this op type) — only stat, attacks_per_turn, and keyword honour until_end_of_turn`,
      });
    }

    if (
      eff.duration !== undefined &&
      eff.duration !== null &&
      eff.duration !== false &&
      !DURATION_FIELD_OPS.has(op)
    ) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${op} op at ${fullPath} uses "duration" (ignored by engine for this op type) — only stat and keyword honour duration`,
      });
    }
  });
  return issues;
}
