/**
 * Additive-enhance gate — non-Follower cards whose Enhance line is additive
 * (no "instead") must re-include every base spell/fanfare op in the Enhance
 * tier effects. The spell play path replaces base effects with the tier when
 * the tier is non-empty, so omitting base ops silently drops printed clauses.
 */

type CardJson = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  spell?: unknown[];
  fanfare?: unknown[];
  keywords?: unknown[];
};

export type AdditiveEnhanceGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

/** Match `Enhance (8):` and `Enhance(9):` spellings; return each Enhance line. */
function enhanceLinesFromDescription(description: string): string[] {
  const lines = description.split(/\r?\n/);
  return lines.filter((line) => /^\s*Enhance\s*\(\s*\d+\s*\)\s*:/i.test(line));
}

function enhanceCostFromLine(line: string): number | null {
  const m = line.match(/Enhance\s*\(\s*(\d+)\s*\)\s*:/i);
  return m ? Number(m[1]) : null;
}

function baseEffects(card: CardJson): unknown[] {
  if (Array.isArray(card.spell) && card.spell.length > 0) return card.spell;
  if (Array.isArray(card.fanfare) && card.fanfare.length > 0)
    return card.fanfare;
  return [];
}

/** Collect every op-bearing node, recursing into effects / options / then. */
function collectOpNodes(
  node: unknown,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const child of node) collectOpNodes(child, out);
    return out;
  }
  if (typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  if (typeof obj.op === "string") {
    out.push(obj);
  }
  for (const key of ["effects", "options", "then"] as const) {
    if (key in obj) collectOpNodes(obj[key], out);
  }
  return out;
}

function opSignature(op: Record<string, unknown>): string {
  return JSON.stringify(op);
}

function opLabel(op: Record<string, unknown>): string {
  const name = String(op.op ?? "?");
  const action = op.action != null ? `/${String(op.action)}` : "";
  return `${name}${action}`;
}

function countBySignature(
  ops: Record<string, unknown>[],
): Map<string, { count: number; label: string }> {
  const map = new Map<string, { count: number; label: string }>();
  for (const op of ops) {
    const sig = opSignature(op);
    const prev = map.get(sig);
    if (prev) prev.count += 1;
    else map.set(sig, { count: 1, label: opLabel(op) });
  }
  return map;
}

export function checkAdditiveEnhanceForCard(
  card: CardJson,
): AdditiveEnhanceGateIssue[] {
  const issues: AdditiveEnhanceGateIssue[] = [];

  if (card.type === "Follower") return issues;

  const base = baseEffects(card);
  if (!base.length) return issues;

  if (!Array.isArray(card.keywords)) return issues;

  const enhanceLines = enhanceLinesFromDescription(
    String(card.description ?? ""),
  );
  if (!enhanceLines.length) return issues;

  const baseCounts = countBySignature(collectOpNodes(base));

  for (const kw of card.keywords) {
    if (!kw || typeof kw !== "object") continue;
    const name = String((kw as { name?: unknown }).name ?? "");
    if (name.toLowerCase() !== "enhance") continue;
    const effects = (kw as { effects?: unknown }).effects;
    if (!Array.isArray(effects) || effects.length === 0) continue;

    const cost = (kw as { cost?: unknown }).cost;
    const matchedLines =
      cost != null
        ? enhanceLines.filter(
            (line) => enhanceCostFromLine(line) === Number(cost),
          )
        : [];
    const linesForTier = matchedLines.length ? matchedLines : enhanceLines;

    // Escape hatch: printed Enhance line says "instead" → replacement is intentional.
    if (linesForTier.every((line) => /\binstead\b/i.test(line))) continue;

    const tierCounts = countBySignature(collectOpNodes(effects));
    const missing: string[] = [];
    for (const [sig, { count, label }] of baseCounts) {
      const have = tierCounts.get(sig)?.count ?? 0;
      if (have < count) {
        missing.push(`${label} (need ${count}, have ${have})`);
      }
    }

    if (missing.length) {
      const quote = linesForTier[0]!.trim();
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: additive Enhance tier is missing base op(s) [${missing.join(", ")}] — "${quote}"`,
      });
    }
  }

  return issues;
}
