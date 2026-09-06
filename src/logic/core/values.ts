import { state } from "../../core/gameState.js";
import type { CardInstance, Player } from "../../core/types/index.js";
import {
  getHand,
  getBoard,
  getPlaysThisTurn,
} from "../../core/playerHelpers.js";
import { resolveDamageAmountExtended } from "../effects/ops/damage/primitives.js";
import { resolveUid } from "../../core/uidResolver.js";
import { readEnv } from "../../core/env.js";

interface ResolveContext {
  sourceCard?: CardInstance | null;
  attacker?: CardInstance | null;
  defender?: CardInstance | null;
  selectedCard?: CardInstance | null;
  owner?: Player;
  variables?: Record<string, unknown>;
  [key: string]: any;
}

const SELF_VALUE_TEMPLATES = [
  "{self.attack}",
  "{self.defense}",
  "{self.cost}",
  "{self.spellboostcount}",
  "{self.fused_loot_unique}",
] as const;

const SIMPLE_VALUE_TEMPLATES = [
  "{attacker.attack}",
  "{defender.defense}",
  "{selected.defense}",
  "{selected.attack}",
  "{entering.attack}",
  "{last_discarded_cost}",
  "{last_drawn_cost}",
  "{last_returned}",
  "{last_returned_count}",
  "{hand_size}",
  "{earth_counter_sum}",
  "{combo}",
  "{enemy_minus_ally_followers}",
  "{ward_allies}",
] as const;

/** Exact `{...}` templates handled by resolveDynamicValue (lowercase). */
export const RECOGNIZED_VALUE_TEMPLATES: readonly string[] = [
  ...SELF_VALUE_TEMPLATES,
  ...SIMPLE_VALUE_TEMPLATES,
];

const RECOGNIZED_VALUE_TEMPLATE_SET = new Set(RECOGNIZED_VALUE_TEMPLATES);

const HAND_CLASS_COUNT_PREFIX = "{hand_class_count:";
const RANDOM_SPLIT_PLACEHOLDER_RE = /^\{[A-Z]+\}$/;

function isTestEnv(): boolean {
  const vitest = readEnv("VITEST");
  const nodeEnv = readEnv("NODE_ENV");
  return nodeEnv === "test" || vitest === "true" || vitest === "1";
}

export function isRecognizedDynamicTemplate(template: string): boolean {
  const trimmed = template.trim();
  const lower = trimmed.toLowerCase();
  if (RECOGNIZED_VALUE_TEMPLATE_SET.has(lower)) return true;
  if (lower.startsWith(HAND_CLASS_COUNT_PREFIX) && lower.endsWith("}")) {
    return true;
  }
  if (RANDOM_SPLIT_PLACEHOLDER_RE.test(trimmed)) return true;
  return false;
}

function warnUnknownTemplate(template: string): void {
  if (isTestEnv()) {
    throw new Error(`[values] Unknown dynamic template: ${template}`);
  }
  console.warn(
    `[values] Unknown dynamic template: ${template}, defaulting to 0`,
  );
}

function warnMissingOwner(template: string): void {
  if (isTestEnv()) {
    throw new Error(
      `[values] Template ${template} requires context.owner but none was provided`,
    );
  }
  console.warn(
    `[values] Template ${template} requires context.owner but none was provided, defaulting to 0`,
  );
}

function warnUnresolvedTemplate(template: string): void {
  if (isTestEnv()) {
    throw new Error(`[values] Unresolved dynamic template: ${template}`);
  }
  console.warn(
    `[values] Unresolved dynamic template: ${template}, defaulting to 0`,
  );
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
    if (s === SELF_VALUE_TEMPLATES[0])
      return parseInt((src as any)?.attack || 0, 10) || 0;
    if (s === SELF_VALUE_TEMPLATES[1])
      return parseInt((src as any)?.defense || 0, 10) || 0;
    if (s === SELF_VALUE_TEMPLATES[2])
      return parseInt((src as any)?.cost || 0, 10) || 0;
    if (s === SELF_VALUE_TEMPLATES[3]) {
      const ks = src?.keywordState?.spellboostCount;
      if (typeof ks === "number") return ks;
      return parseInt((src as any)?.spellboostCount || 0, 10) || 0;
    }
    if (s === SELF_VALUE_TEMPLATES[4]) {
      const arr = Array.isArray((src as any)?._fusedLootNames)
        ? (src as any)._fusedLootNames
        : [];
      return new Set(arr.map(String)).size | 0;
    }
    if (/^\{.+\}$/.test(raw)) {
      warnUnresolvedTemplate(raw);
      return 0;
    }
  }

  // 2. {attacker.*} / {defender.*}
  if (s === SIMPLE_VALUE_TEMPLATES[0])
    return parseInt((context.attacker as any)?.attack || 0, 10) || 0;
  if (s === SIMPLE_VALUE_TEMPLATES[1])
    return parseInt((context.defender as any)?.defense || 0, 10) || 0;

  // 3. {selected.*}
  if (s === SIMPLE_VALUE_TEMPLATES[2]) {
    const sel = context.selectedCard || state.__lastSelected;
    return parseInt((sel as any)?.defense || 0, 10) || 0;
  }
  if (s === SIMPLE_VALUE_TEMPLATES[3]) {
    const sel = context.selectedCard || state.__lastSelected;
    return parseInt((sel as any)?.attack || 0, 10) || 0;
  }

  if (s === SIMPLE_VALUE_TEMPLATES[4]) {
    const entering = (context as any).enteringCard;
    const uid = (context as any).enteringCardUid ?? entering?.uid;
    const live = uid ? resolveUid(String(uid)) : null;
    const card = live ?? entering;
    return parseInt(String(card?.attack ?? 0), 10) || 0;
  }

  // 4. Game state / Globals
  if (s === SIMPLE_VALUE_TEMPLATES[5]) {
    return parseInt((state as any).lastDiscardedCost, 10) || 0;
  }
  if (s === SIMPLE_VALUE_TEMPLATES[6]) {
    const last =
      (state as any).lastDrawnCards?.[0] ?? (state as any).lastDrawnCard;
    return parseInt(String(last?.cost ?? 0), 10) || 0;
  }
  if (s === SIMPLE_VALUE_TEMPLATES[7] || s === SIMPLE_VALUE_TEMPLATES[8]) {
    return parseInt(String((state as any).lastReturnedCount ?? 0), 10) || 0;
  }
  if (s === SIMPLE_VALUE_TEMPLATES[9]) {
    if (context.owner) {
      const hand = getHand(state, context.owner);
      return hand.length | 0;
    }
    warnMissingOwner("{hand_size}");
    return 0;
  }
  // Count of cards in the acting player's hand whose class matches the argument.
  if (s.startsWith(HAND_CLASS_COUNT_PREFIX) && s.endsWith("}")) {
    const owner = context.owner;
    if (owner) {
      const cls = s
        .slice(HAND_CLASS_COUNT_PREFIX.length, -1)
        .trim()
        .toLowerCase();
      const hand = getHand(state, owner) || [];
      return hand.filter((c) => String(c.class ?? "").toLowerCase() === cls)
        .length;
    }
    warnMissingOwner("{hand_class_count:*}");
    return 0;
  }
  if (s === SIMPLE_VALUE_TEMPLATES[10]) {
    if (context.owner) {
      const board = getBoard(state, context.owner);
      const sum = board
        .filter((c) => c?.type === "Amulet" && (c.counters?.earth || 0) > 0)
        .reduce((acc, c) => acc + (c.counters?.earth || 0), 0);
      return sum;
    }
    warnMissingOwner("{earth_counter_sum}");
    return 0;
  }

  if (s === SIMPLE_VALUE_TEMPLATES[11]) {
    if (context.owner) {
      return getPlaysThisTurn(state, context.owner);
    }
    warnMissingOwner("{combo}");
    return 0;
  }

  // Enemy follower count minus allied follower count (floored at 0).
  if (s === SIMPLE_VALUE_TEMPLATES[12]) {
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
    warnMissingOwner("{enemy_minus_ally_followers}");
    return 0;
  }

  // Allied Ward followers on the owner's board.
  if (s === SIMPLE_VALUE_TEMPLATES[13]) {
    const owner = context.owner;
    if (owner) {
      return getBoard(state, owner).filter(
        (c) => c?.type === "Follower" && !!c.hasWard,
      ).length;
    }
    warnMissingOwner("{ward_allies}");
    return 0;
  }

  if (/^\{.+\}$/.test(raw)) {
    warnUnknownTemplate(raw);
    return 0;
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
  eff: {
    amount?: number | string;
    amount_source?: string;
    count_source?: string;
  },
  context: ResolveContext = {},
  defaultAmount = 1,
): number {
  const src = eff.amount_source ?? eff.count_source;
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
