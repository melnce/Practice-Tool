import type { CardInstance } from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";

function hasKeyword(card: CardInstance, kw: any) {
  const k = String(kw || "").toLowerCase();
  if (k === "ward" && card.hasWard) return true;
  if (k === "rush" && card.hasRush) return true;
  if (k === "storm" && card.hasStorm) return true;
  if (k === "bane" && card.hasBane) return true;
  if (k === "ambush" && card.hasAmbush) return true;
  if (k === "aura" && card.hasAura) return true;
  if (k === "drain" && card.hasDrain) return true;
  if (k === "intimidate" && card.hasIntimidate) return true;
  if (k === "lastwords" && card.hasLastWords) return true;

  if (Array.isArray(card.keywords)) {
    return card.keywords.some(
      (w) =>
        (typeof w === "string" && String(w).toLowerCase() === k) ||
        (w &&
          typeof w === "object" &&
          String(w.name || "").toLowerCase() === k),
    );
  }
  return false;
}

export function filterBuffCandidates(
  pool: CardInstance[],
  eff: StatOp,
  _sourceCard: CardInstance | null,
): CardInstance[] {
  // Self-exclusion is already handled by the targeting system (applyFilters)
  // filterBuffCandidates only applies additional buff-specific filters
  let candidates = pool.filter((c) => c != null && c.type === "Follower");

  // Tribe filtering
  const rawTribes = eff.tribes
    ? Array.isArray(eff.tribes)
      ? eff.tribes
      : [eff.tribes]
    : eff.tribe
      ? [eff.tribe]
      : null;

  if (rawTribes) {
    const want = rawTribes.map((t: any) => String(t).toLowerCase());
    candidates = candidates.filter(
      (c) =>
        Array.isArray(c.tribes) &&
        c.tribes.some((tr) => want.includes(String(tr).toLowerCase())),
    );
  }

  // Name filtering
  if (eff.name_filter) {
    const want = String(eff.name_filter).toLowerCase();
    candidates = candidates.filter(
      (c) => String(c.name || "").toLowerCase() === want,
    );
  }
  if (Array.isArray(eff.name_in) && eff.name_in.length) {
    const wants = new Set(eff.name_in.map((n: any) => String(n).toLowerCase()));
    candidates = candidates.filter((c) =>
      wants.has(String(c.name || "").toLowerCase()),
    );
  }

  // Keyword filtering
  const rawKW = eff.has_keyword;
  if (rawKW) {
    const wants = Array.isArray(rawKW) ? rawKW : [rawKW];
    candidates = candidates.filter((c) =>
      wants.every((w: any) => hasKeyword(c, w)),
    );
  }

  // Positional selector (distribution:"leftmost" — 10423310 Knightly Ardor mode 1)
  const distribution = String((eff as any).distribution || "").toLowerCase();
  if (distribution === "leftmost" && candidates.length > 0) {
    const first = candidates[0];
    candidates = first ? [first] : [];
  }

  return candidates;
}
