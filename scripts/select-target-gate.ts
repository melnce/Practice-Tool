/**
 * Select-target gate — flags ops that use `selected` / `selected:*` as a pool
 * without a parent select establishing the selection context.
 */

type CardJson = {
  id: string;
  name: string;
  description?: string;
};

export type SelectTargetGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

function isSelectedTarget(target: unknown): boolean {
  if (target == null) return false;
  const t = String(target).toLowerCase();
  return t === "selected" || t.startsWith("selected:");
}

function opSnippet(eff: Record<string, unknown>): string {
  const op = String(eff.op ?? "?");
  const target =
    eff.target != null ? `, target: ${JSON.stringify(eff.target)}` : "";
  const select =
    eff.select != null
      ? `, select: ${JSON.stringify(eff.select)}`
      : eff.select_count != null
        ? `, select_count: ${JSON.stringify(eff.select_count)}`
        : "";
  const amount =
    eff.amount != null ? `, amount: ${JSON.stringify(eff.amount)}` : "";
  return `{ op: "${op}"${target}${select}${amount} }`;
}

function hasSelectKey(eff: Record<string, unknown>): boolean {
  return eff.select != null || eff.select_count != null;
}

function establishesSelection(eff: Record<string, unknown>): boolean {
  return eff.op === "select" || hasSelectKey(eff);
}

function walkEffectTree(
  node: unknown,
  ancestors: Record<string, unknown>[],
  visitor: (
    eff: Record<string, unknown>,
    ancestors: Record<string, unknown>[],
  ) => void,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkEffectTree(child, ancestors, visitor);
    return;
  }
  const obj = node as Record<string, unknown>;
  const nextAncestors =
    typeof obj.op === "string" ? [...ancestors, obj] : ancestors;
  if (typeof obj.op === "string") {
    visitor(obj, ancestors);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    walkEffectTree(v, nextAncestors, visitor);
  }
}

function hasSelectionAncestor(ancestors: Record<string, unknown>[]): boolean {
  return ancestors.some((a) => establishesSelection(a));
}

export function checkSelectTargetForCard(
  card: CardJson,
): SelectTargetGateIssue[] {
  const issues: SelectTargetGateIssue[] = [];

  walkEffectTree(card, [], (eff, ancestors) => {
    if (!isSelectedTarget(eff.target)) return;

    const snippet = opSnippet(eff);

    if (hasSelectKey(eff)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: op uses selected target with its own select key — pool cannot come from already-selected set: ${snippet}`,
      });
      return;
    }

    if (!hasSelectionAncestor(ancestors)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: op uses selected target without a parent select — resolves against empty pool at runtime: ${snippet}`,
      });
    }
  });

  return issues;
}
