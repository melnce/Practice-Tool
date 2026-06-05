import type { CardInstance } from "../../core/types/index.js";

/** Keyword state captured at the instant of entering (rulebook §256). */
export type EnteringKeywordSnapshot = Pick<
  CardInstance,
  | "hasWard"
  | "hasRush"
  | "hasStorm"
  | "hasBane"
  | "hasAmbush"
  | "hasAura"
  | "hasBarrier"
  | "hasIntimidate"
  | "hasDrain"
  | "hasLastWords"
  | "keywords"
> & {
  temp_keywords?: unknown[];
};

export function snapshotEnteringKeywords(
  card: CardInstance,
): EnteringKeywordSnapshot {
  return {
    hasWard: !!card.hasWard,
    hasRush: !!card.hasRush,
    hasStorm: !!card.hasStorm,
    hasBane: !!card.hasBane,
    hasAmbush: !!card.hasAmbush,
    hasAura: !!card.hasAura,
    hasBarrier: !!card.hasBarrier,
    hasIntimidate: !!card.hasIntimidate,
    hasDrain: !!card.hasDrain,
    hasLastWords: !!card.hasLastWords,
    keywords: Array.isArray(card.keywords)
      ? structuredClone(card.keywords)
      : [],
    temp_keywords: Array.isArray((card as any).temp_keywords)
      ? structuredClone((card as any).temp_keywords)
      : [],
  };
}

export function mergeEnteringKeywordSnapshot(
  card: CardInstance,
  snapshot: EnteringKeywordSnapshot | undefined,
): CardInstance {
  if (!snapshot) return card;
  return { ...card, ...snapshot };
}
