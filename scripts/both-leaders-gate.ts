/**
 * Both-leaders gate — printed "both leaders" must be one `all:leader` damage op.
 * Reports split ally:leader + enemy:leader pairs and other mismatches; does not fix.
 */

type CardJson = {
  id: string;
  name: string;
  description?: string;
};

export type BothLeadersGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

const BOTH_LEADERS_RE = /\bboth\s+leaders\b/i;

type DamageOp = {
  op: string;
  target?: string;
  amount?: number | string;
  distribution?: string;
};

function isBothLeadersDirectOp(eff: DamageOp): boolean {
  return (
    eff.target === "all:leader" &&
    eff.distribution !== "by_stat" &&
    String(eff.distribution ?? "direct") !== "by_stat"
  );
}

function collectPrintedText(card: CardJson): string {
  const parts: string[] = [];
  if (card.description) parts.push(card.description);

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.description === "string") parts.push(rec.description);
    if (typeof rec.skill_text === "string") parts.push(rec.skill_text);
    for (const v of Object.values(rec)) walk(v);
  }

  walk(card);
  return parts.join("\n");
}

function walkDamageOps(node: unknown, visit: (eff: DamageOp) => void): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walkDamageOps(child, visit);
    return;
  }
  if (typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (rec.op === "damage") visit(rec as DamageOp);
  for (const v of Object.values(rec)) walkDamageOps(v, visit);
}

function isSplitBothLeadersPair(ops: DamageOp[], index: number): boolean {
  const a = ops[index];
  const b = ops[index + 1];
  if (!a || !b) return false;
  if (a.target !== "ally:leader" || b.target !== "enemy:leader") return false;
  return String(a.amount ?? "") === String(b.amount ?? "");
}

export function checkBothLeadersForCard(
  card: CardJson,
): BothLeadersGateIssue[] {
  const issues: BothLeadersGateIssue[] = [];
  const printed = collectPrintedText(card);
  const saysBothLeaders = BOTH_LEADERS_RE.test(printed);

  const damageOps: DamageOp[] = [];
  walkDamageOps(card, (eff) => damageOps.push(eff));

  const allLeaderOps = damageOps.filter(isBothLeadersDirectOp);
  const splitPairs: number[] = [];
  for (let i = 0; i < damageOps.length - 1; i++) {
    if (isSplitBothLeadersPair(damageOps, i)) splitPairs.push(i);
  }

  for (const i of splitPairs) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: `split ally:leader + enemy:leader pair (amount ${damageOps[i]!.amount}) must be one all:leader op`,
    });
  }

  if (saysBothLeaders && allLeaderOps.length === 0 && splitPairs.length === 0) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message:
        'printed text says "both leaders" but no damage op with target all:leader',
    });
  }

  if (!saysBothLeaders && allLeaderOps.length > 0) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: `direct damage op target all:leader without printed "both leaders" (${allLeaderOps.length} op(s))`,
    });
  }

  return issues;
}
