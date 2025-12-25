// src/helpers/enhance.ts

import { CardInstance, Effect, KeywordEntry } from "../core/types/index.js";

// Helper type for enhance tier
interface EnhanceTier {
  cost: number;
  effects?: Effect[];
}

export function getEnhanceTiers(card: CardInstance): EnhanceTier[] {
  if (Array.isArray(card?.enhanceTiers) && card.enhanceTiers.length) {
    return [...card.enhanceTiers].sort((a, b) => b.cost - a.cost);
  }

  const list = Array.isArray(card?.keywords) ? card.keywords : [];
  const tiers: EnhanceTier[] = [];

  for (const k of list) {
    const name = (typeof k === "string" ? k : k?.name) || "";
    if (name.toLowerCase() === "enhance") {
      // k is a KeywordEntry object here if not string, but TS doesn't know for sure
      // Safely cast or check
      const entry = k as KeywordEntry;
      const cost = Number(typeof k === "object" ? entry.cost : 0);
      const effects =
        typeof k === "object" && Array.isArray(entry.effects)
          ? entry.effects
          : [];
      if (cost > 0) tiers.push({ cost, effects });
    }
  }
  tiers.sort((a, b) => b.cost - a.cost);
  return tiers;
}

export function previewHandStats(card: CardInstance, availablePP: number) {
  const isFollower = card.type === "Follower";
  const baseCost = Number(card.cost) || 0;
  let shownCost = baseCost;
  let atkDisp = isFollower ? Number(card.attack) || 0 : 0;
  let defDisp = isFollower ? Number(card.defense) || 0 : 0;

  const tiers = getEnhanceTiers(card);
  const tier = tiers.find((t) => availablePP >= t.cost) || null;
  if (tier) {
    shownCost = tier.cost;
    for (const eff of tier.effects || []) {
      if (eff.op === "stat" && (eff as any).target === "self") {
        atkDisp += Number((eff as any).attack) || 0;
        defDisp += Number((eff as any).defense) || 0;
      }
    }
  }
  return { shownCost, atkDisp, defDisp, tier };
}














