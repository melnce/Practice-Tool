// src/helpers/alternateForm.ts
// Crystallize / Accelerate alternate-form helpers.
// Inverse of Enhance: activates when PP is below the normal effective cost
// but at or above an alternate cost. Highest payable alternate wins.

import type {
  CardInstance,
  Effect,
  KeywordEntry,
} from "../core/types/index.js";

export type AlternateKind = "accelerate" | "crystallize";

export interface AlternateForm {
  kind: AlternateKind;
  cost: number;
  /** Accelerate: spell effect list. */
  effects: Effect[];
  /** Crystallize: amulet keywords (Countdown, LastWords, …). */
  amuletKeywords: KeywordEntry[];
}

function asKeywordEntries(card: CardInstance): KeywordEntry[] {
  const list = Array.isArray(card?.keywords) ? card.keywords : [];
  const out: KeywordEntry[] = [];
  for (const k of list) {
    if (!k || typeof k === "string") continue;
    if (typeof k.name === "string") out.push(k);
  }
  return out;
}

/** Collect Accelerate / Crystallize forms authored on the card. */
export function getAlternateForms(card: CardInstance): AlternateForm[] {
  const forms: AlternateForm[] = [];
  for (const k of asKeywordEntries(card)) {
    const name = String(k.name || "").toLowerCase();
    const cost = Number(k.cost);
    if (!Number.isFinite(cost) || cost < 0) continue;

    if (name === "accelerate") {
      forms.push({
        kind: "accelerate",
        cost,
        effects: Array.isArray(k.effects) ? [...k.effects] : [],
        amuletKeywords: [],
      });
    } else if (name === "crystallize") {
      const nested = Array.isArray(k.amuletKeywords)
        ? k.amuletKeywords
        : Array.isArray(k.keywords)
          ? k.keywords
          : [];
      forms.push({
        kind: "crystallize",
        cost,
        effects: Array.isArray(k.effects) ? [...k.effects] : [],
        amuletKeywords: nested.filter(
          (nk): nk is KeywordEntry =>
            !!nk && typeof nk === "object" && typeof nk.name === "string",
        ),
      });
    }
  }
  forms.sort((a, b) => b.cost - a.cost);
  return forms;
}

/**
 * Effective cost to play the card in its printed form (base + hand mod).
 * Enhance / Accelerate / Crystallize alternate costs are separate.
 */
export function getEffectivePlayCost(card: CardInstance): number {
  if (typeof card.effectiveCost === "number") {
    return Math.max(0, card.effectiveCost);
  }
  const base = parseInt(String(card.cost), 10) || 0;
  const handMod = parseInt(String(card.cost_mod), 10) || 0;
  return Math.max(0, base + handMod);
}

/**
 * Highest-payable Crystallize/Accelerate when PP is below the normal
 * effective cost. Returns null when normal play is affordable or no
 * alternate is payable.
 */
export function pickAlternateForm(
  card: CardInstance,
  availablePP: number,
  effectivePlayCost: number = getEffectivePlayCost(card),
): AlternateForm | null {
  if (availablePP >= effectivePlayCost) return null;
  for (const form of getAlternateForms(card)) {
    if (availablePP >= form.cost) return form;
  }
  return null;
}

export function alternateFormLabel(form: AlternateForm | null): string | null {
  if (!form) return null;
  return form.kind === "accelerate" ? "Accelerate" : "Crystallize";
}
