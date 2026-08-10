import { state } from "../../core/gameState.js";
import type { Player } from "../../core/types/index.js";
import { getHand } from "../../core/playerHelpers.js";

// Helper to check for the keyword OR the gate op (allows removing explicit keyword)
export function hasSkyboundArt(card: any): boolean {
  if (!card) return false;

  // Check Explicit Keyword
  if (
    Array.isArray(card.keywords) &&
    card.keywords.some((k: any) => {
      const str = typeof k === "string" ? k : k?.name;
      return String(str || "").toLowerCase() === "skybound art";
    })
  ) {
    return true;
  }

  // Check Fanfare for unified gate with condition: skybound_art
  if (
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (f: any) => f.op === "gate" && f.condition === "skybound_art",
    )
  ) {
    return true;
  }

  // Check Triggers for gate (in effects)
  if (Array.isArray(card.triggers)) {
    for (const t of card.triggers) {
      if (
        Array.isArray(t.effects) &&
        t.effects.some(
          (e: any) => e.op === "gate" && e.condition === "skybound_art",
        )
      ) {
        return true;
      }
    }
  }

  // Check Spell effects for gate (for Spells like Alfheimr)
  if (
    Array.isArray(card.spell) &&
    card.spell.some(
      (s: any) => s.op === "gate" && s.condition === "skybound_art",
    )
  ) {
    return true;
  }

  return false;
}

/** Gauge when a Skybound Art card is played: turn# + in-hand allied evolves witnessed. */
export function getSkyboundArtGauge(
  card: { skyboundArtEvolvesWitnessed?: number },
  turnNumber?: number,
): number {
  const witnesses = card?.skyboundArtEvolvesWitnessed || 0;
  const turn = turnNumber ?? state.roundCount ?? 1;
  return turn + witnesses;
}

export function meetsSkyboundArtThreshold(
  card: { skyboundArtEvolvesWitnessed?: number },
  requirement: number,
  turnNumber?: number,
): boolean {
  return getSkyboundArtGauge(card, turnNumber) >= requirement;
}

/**
 * Called whenever an ally evolves.
 * Increments the 'evolves witnessed' counter on all "Skybound Art" cards in hand.
 */
export function incrementSkyboundArt(owner: Player, amount: number = 1) {
  const hand = getHand(state, owner);
  let updated = false;

  for (const card of hand) {
    if (hasSkyboundArt(card)) {
      // Initialize if missing
      card.skyboundArtEvolvesWitnessed =
        (card.skyboundArtEvolvesWitnessed || 0) + amount;
      updated = true;
      // logEvent("skyboundCharge", { owner, card: card.name, newCount: card.skyboundArtEvolvesWitnessed });
    }
  }

  if (updated) {
    // Render removed - UI layer
  }
}
