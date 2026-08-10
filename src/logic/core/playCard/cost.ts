import type { CardInstance, Effect } from "../../../core/types/index.js";

export function getEffectiveCost(card: CardInstance): number {
  if (typeof card.effectiveCost === "number") return card.effectiveCost;
  if (card.cost_mod != null)
    return (
      (parseInt(String(card.cost), 10) || 0) +
      (parseInt(String(card.cost_mod), 10) || 0)
    );
  if ((card as any).costModified != null)
    return parseInt((card as any).costModified, 10) || 0;
  return parseInt(String(card.cost), 10) || 0;
}

export function pickEnhanceTier(
  card: CardInstance,
  availablePP: number,
): { cost: number; effects: Effect[] } | null {
  const tiers = Array.isArray(card.enhanceTiers) ? card.enhanceTiers : [];
  if (!tiers.length && Array.isArray(card.keywords)) {
    const tmp = [];
    for (const k of card.keywords) {
      const name = (typeof k === "string" ? k : k?.name) || "";
      if (name.toLowerCase() === "enhance") {
        const cost = Number(typeof k === "object" ? k.cost : 0);
        const effects =
          typeof k === "object" && Array.isArray(k.effects) ? k.effects : [];
        if (cost > 0) tmp.push({ cost, effects });
      }
    }
    tmp.sort((a: any, b: any) => b.cost - a.cost);
    (card as any).enhanceTiers = tmp;
  }
  for (const t of card.enhanceTiers || []) {
    if (availablePP >= t.cost)
      return { cost: t.cost, effects: t.effects || [] }; // highest affordable
  }
  return null;
}
