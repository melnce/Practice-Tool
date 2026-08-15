import { state } from "../../core/gameState.js";
import type { CardInstance, Player } from "../../core/types/index.js";
import {
  getHand,
  getBoard,
  getPlaysThisTurn,
} from "../../core/playerHelpers.js";
import { resolveDamageAmountExtended } from "../effects/ops/damage/primitives.js";

interface ResolveContext {
  sourceCard?: CardInstance | null;
  attacker?: CardInstance | null;
  defender?: CardInstance | null;
  selectedCard?: CardInstance | null;
  owner?: Player;
  variables?: Record<string, unknown>;
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

  const raw = String(val).trim();
  if (raw.startsWith("-{") && raw.endsWith("}")) {
    const inner = raw.slice(2, -1).trim();
    return -resolveDynamicValue(`{${inner}}`, context);
  }

  const s = raw.toLowerCase();

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
  if (s === "{last_drawn_cost}") {
    const last =
      (state as any).lastDrawnCards?.[0] ?? (state as any).lastDrawnCard;
    return parseInt(String(last?.cost ?? 0), 10) || 0;
  }
  if (s === "{last_returned}" || s === "{last_returned_count}") {
    return parseInt(String((state as any).lastReturnedCount ?? 0), 10) || 0;
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
      const sum = board
        .filter((c) => c?.type === "Amulet" && (c.counters?.earth || 0) > 0)
        .reduce((acc, c) => acc + (c.counters?.earth || 0), 0);
      return sum;
    }
    return 0; // No owner = no sigils
  }

  if (s === "{combo}") {
    if (context.owner) {
      return getPlaysThisTurn(state, context.owner);
    }
  }

  // Enemy follower count minus allied follower count (floored at 0).
  if (s === "{enemy_minus_ally_followers}") {
    const owner = context.owner;
    if (owner) {
      const ally = owner;
      const enemy = owner === "first" ? "second" : "first";
      const allyN = getBoard(state, ally).filter(
        (c) => c?.type === "Follower",
      ).length;
      const enemyN = getBoard(state, enemy).filter(
        (c) => c?.type === "Follower",
      ).length;
      return Math.max(0, enemyN - allyN);
    }
  }

  // Allied Ward followers on the owner's board.
  if (s === "{ward_allies}") {
    const owner = context.owner;
    if (owner) {
      return getBoard(state, owner).filter(
        (c) => c?.type === "Follower" && !!c.hasWard,
      ).length;
    }
  }

  // 5. Raw number parse
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolves an effect's numeric amount from `amount`, `amount_source`, or dynamic strings.
 * Shared by countdown and other ops that mirror damage-style amount sources.
 */
export function resolveEffectAmount(
  eff: { amount?: number | string; amount_source?: string },
  context: ResolveContext = {},
  defaultAmount = 1,
): number {
  const src = eff.amount_source;
  if (src) {
    if (String(src).startsWith("context.")) {
      const varName = String(src).slice("context.".length);
      const val =
        context.variables?.[varName] ??
        (context as Record<string, unknown>)[varName];
      if (typeof val === "number" && Number.isFinite(val)) {
        return val;
      }
      console.warn(
        `[amount] Missing context variable: ${varName}, defaulting to 0`,
      );
      return 0;
    }
    if (context.owner) {
      return resolveDamageAmountExtended(
        {} as any,
        {
          owner: context.owner,
          sourceCard: context.sourceCard ?? null,
          ...(context.selectedCard
            ? { selectedCard: context.selectedCard }
            : {}),
        },
        src as any,
      );
    }
    return 0;
  }

  if (eff.amount != null && eff.amount !== "") {
    const resolved = resolveDynamicValue(eff.amount, context);
    return Number.isFinite(resolved) ? resolved : defaultAmount;
  }

  return defaultAmount;
}
