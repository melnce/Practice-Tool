/**
 * Enhance semantics gate — additive by default; `enhance_replaces_base` only
 * when the printed Enhance line says "instead". Applies to every card type.
 *
 * Rules (all errors):
 *   A — Enhance line contains "instead" but flag is not set
 *   B — flag is set but no Enhance line says "instead"
 *   C — flag set with no base effects to replace, or no Enhance entry with effects
 *   D — additive Enhance tier duplicates base ops (would double-fire after unify)
 */

type CardJson = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  spell?: unknown[];
  fanfare?: unknown[];
  keywords?: unknown[];
  enhance_replaces_base?: unknown;
};

export type EnhanceSemanticsGateIssue = {
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

function hasEnhanceWithEffects(card: CardJson): boolean {
  if (!Array.isArray(card.keywords)) return false;
  for (const k of card.keywords) {
    if (!k || typeof k !== "object") continue;
    const name = String((k as { name?: unknown }).name ?? "");
    if (name.toLowerCase() !== "enhance") continue;
    const effects = (k as { effects?: unknown }).effects;
    if (Array.isArray(effects) && effects.length > 0) return true;
  }
  return false;
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

export function checkEnhanceSemanticsForCard(
  card: CardJson,
): EnhanceSemanticsGateIssue[] {
  const issues: EnhanceSemanticsGateIssue[] = [];
  const flagTruthy = Boolean(card.enhance_replaces_base);
  const desc = String(card.description ?? "");
  const enhanceLines = enhanceLinesFromDescription(desc);
  const insteadLines = enhanceLines.filter((line) => /\binstead\b/i.test(line));
  const base = baseEffects(card);
  const hasBase = base.length > 0;
  const hasEnhanceEffects = hasEnhanceWithEffects(card);

  // Rule A — printed "instead" requires the flag.
  if (insteadLines.length && !flagTruthy) {
    for (const line of insteadLines) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: Enhance line says "instead" but enhance_replaces_base is missing — "${line.trim()}"`,
      });
    }
  }

  // Rule B — flag without any "instead" Enhance line.
  if (flagTruthy && insteadLines.length === 0) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: `${card.id} ${card.name}: enhance_replaces_base is set but no Enhance line says "instead"`,
    });
  }

  // Rule C — dead flag (nothing to replace, or no Enhance effects).
  if (flagTruthy) {
    if (!hasBase) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: enhance_replaces_base is set but card has no base effects to replace`,
      });
    }
    if (!hasEnhanceEffects) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: enhance_replaces_base is set but card has no Enhance keyword with effects`,
      });
    }
  }

  // Rule D — additive tier must not re-include base ops.
  if (!Array.isArray(card.keywords) || !hasBase) return issues;

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

    // Replacement tiers may freely differ from base.
    if (
      linesForTier.length &&
      linesForTier.every((line) => /\binstead\b/i.test(line))
    ) {
      continue;
    }

    const tierCounts = countBySignature(collectOpNodes(effects));
    const duplicated: string[] = [];
    for (const [sig, { count, label }] of baseCounts) {
      const have = tierCounts.get(sig)?.count ?? 0;
      if (have > 0) {
        duplicated.push(`${label} (base ${count}, tier ${have})`);
      }
    }

    if (duplicated.length) {
      const quote = (linesForTier[0] ?? enhanceLines[0] ?? "Enhance").trim();
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: additive Enhance tier duplicates base op(s) [${duplicated.join(", ")}] — "${quote}"`,
      });
    }
  }

  return issues;
}
