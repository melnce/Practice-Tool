/**
 * All-allied-include-self gate — Followers whose printed text says
 * "all allied followers" / "all your followers" (no "other") must opt
 * their ally:follower stat ops back into self-inclusion.
 *
 * Engine default (applyFilters): ally:* excludes the source unless
 * include_self / not_self:false / side:"self". That default is correct for
 * "other" wordings and selection effects; cards that say "all" must set
 * include_self on the op (same spelling as Tia / Michelle / Anthuria).
 */

type CardJson = {
  id: string;
  name: string;
  type?: string;
  description?: string;
};

export type AllAlliedIncludeSelfGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

/** Lines that claim "all allied/your followers" without "other". */
function matchingPrintedLines(description: string): string[] {
  const allRe = /\ball\s+(?:allied|your)\s+followers\b/i;
  const otherRe = /\ball\s+other\s+(?:allied|your)\s+followers\b/i;
  return description
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => allRe.test(line) && !otherRe.test(line));
}

function hasSelfInclusion(eff: Record<string, unknown>): boolean {
  const cond = eff.condition;
  if (cond && typeof cond === "object" && !Array.isArray(cond)) {
    const c = cond as Record<string, unknown>;
    if (c.include_self === true) return true;
  }
  return false;
}

function hasSelect(eff: Record<string, unknown>): boolean {
  return eff.select != null || eff.select_count != null;
}

function isAllyFollowerTarget(target: unknown): boolean {
  return String(target ?? "").toLowerCase() === "ally:follower";
}

/**
 * Walk the card tree; yield each stat op targeting ally:follower together
 * with the top-level effect section name it lives under.
 */
function walkStatOps(
  node: unknown,
  section: string,
  visit: (eff: Record<string, unknown>, section: string) => void,
): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const child of node) walkStatOps(child, section, visit);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.op === "stat") {
    visit(obj, section);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    walkStatOps(v, section, visit);
  }
}

const TOP_LEVEL_SECTIONS = [
  "fanfare",
  "evolve",
  "superevolve",
  "keywords",
  "triggers",
  "spell",
  "lastwords",
] as const;

export function checkAllAlliedIncludeSelfForCard(
  card: CardJson,
): AllAlliedIncludeSelfGateIssue[] {
  // Yidmetra, Eld Sword: Evolve grants the +1/+1 buff to the faith crest;
  // at fire time sourceCard is the crest (process.ts crest path), so
  // applyFilters self-exclusion removes nothing. Measured correct — false
  // positive for this static rule. Precedent: Key Spirit id exclusion in
  // checkChosenTarget (scripts/check-canonical-form.ts).
  if (card.id === "10624120") return [];

  if (card.type !== "Follower") return [];

  const desc = String(card.description ?? "");
  const lines = matchingPrintedLines(desc);
  if (!lines.length) return [];

  const issues: AllAlliedIncludeSelfGateIssue[] = [];
  const quoted = lines[0]!;

  for (const section of TOP_LEVEL_SECTIONS) {
    const root = (card as Record<string, unknown>)[section];
    if (root == null) continue;
    walkStatOps(root, section, (eff, sec) => {
      if (!isAllyFollowerTarget(eff.target)) return;
      if (hasSelect(eff)) return;
      if (hasSelfInclusion(eff)) return;
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: printed "${quoted}" (no "other") but ${sec} has ally:follower stat op without include_self — source is excluded by applyFilters default`,
      });
    });
  }

  return issues;
}
