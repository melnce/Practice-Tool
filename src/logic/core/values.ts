import { state } from "../../core/gameState.js";
import { CardInstance, Player } from "../../core/types.js";
import { getHand, getBoard } from "../../core/playerHelpers.js";

interface ResolveContext {
  sourceCard?: CardInstance | null;
  attacker?: CardInstance | null;
  defender?: CardInstance | null;
  selectedCard?: CardInstance | null;
  owner?: Player;
  [key: string]: any;
}

/**
 * Resolves a dynamic value string (e.g. "{self.attack}") or generic number to a number.
 * Defaults to 0 if resolution fails or value is missing.
 */
export function resolveDynamicValue(
  val: string | number | undefined | null,
  context: ResolveContext = {},
): number {
  if (val == null) return 0;
  if (typeof val === "number") return val | 0;

  const s = String(val).trim().toLowerCase();

  // 1. {self.*}
  if (s.startsWith("{self.")) {
    const src = context.sourceCard || context.attacker || null;
    if (s === "{self.attack}")
      return parseInt((src as any)?.attack || 0, 10) || 0;
    if (s === "{self.defense}")
      return parseInt((src as any)?.defense || 0, 10) || 0;
    if (s === "{self.cost}") return parseInt((src as any)?.cost || 0, 10) || 0;
    if (s === "{self.spellboostcount}") {
      const ks = src?.keywordState?.spellboostCount;
      if (typeof ks === "number") return ks;
      return parseInt((src as any)?.spellboostCount || 0, 10) || 0;
    }
    if (s === "{self.fused_loot_unique}") {
      const arr = Array.isArray((src as any)?._fusedLootNames)
        ? (src as any)._fusedLootNames
        : [];
      return new Set(arr.map(String)).size | 0;
    }
  }

  // 2. {attacker.*} / {defender.*}
  if (s === "{attacker.attack}")
    return parseInt((context.attacker as any)?.attack || 0, 10) || 0;
  if (s === "{defender.defense}")
    return parseInt((context.defender as any)?.defense || 0, 10) || 0;

  // 3. {selected.*}
  if (s === "{selected.defense}") {
    const sel = context.selectedCard || state.__lastSelected;
    return parseInt((sel as any)?.defense || 0, 10) || 0;
  }
  if (s === "{selected.attack}") {
    const sel = context.selectedCard || state.__lastSelected;
    return parseInt((sel as any)?.attack || 0, 10) || 0;
  }

  // 4. Game state / Globals
  if (s === "{last_discarded_cost}") {
    return parseInt((state as any).lastDiscardedCost, 10) || 0;
  }
  if (s === "{hand_size}") {
    // if owner provided, resolve for them. If not, default to 0 or derive from source?
    // Safer to require owner in context for non-dependent ops.
    if (context.owner) {
      const hand = getHand(state, context.owner);
      return hand.length | 0;
    }
  }
  if (s === "{earth_counter_sum}") {
    if (context.owner) {
      const board = getBoard(state, context.owner);
      return board
        .filter((c) => c?.type === "Amulet" && (c.counters?.earth || 0) > 0)
        .reduce((sum, c) => sum + (c.counters?.earth || 0), 0);
    }
  }

  // 5. Raw number parse
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}















