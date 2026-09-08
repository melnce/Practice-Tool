import { state } from "../../../../core/gameState.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";
import { resolveDynamicValue } from "../../../core/values.js";
import { readEnv } from "../../../../core/env.js";

/** Canonical resolved duration for stat ops. */
export type StatDuration = "permanent" | "turn_end" | "opponent_turn_end";

/**
 * Single duration resolver for stat ops.
 * Accepts until_end_of_turn, until_eot, duration:"turn_end", duration:"opponent_turn_end".
 */
export function resolveStatDuration(eff: StatOp): StatDuration {
  const rawDuration = (eff as { duration?: string }).duration;
  if (rawDuration === "opponent_turn_end") return "opponent_turn_end";
  if (
    rawDuration === "turn_end" ||
    eff.until_end_of_turn === true ||
    (eff as { until_eot?: boolean }).until_eot === true
  ) {
    return "turn_end";
  }
  return "permanent";
}

const warnedStatSetDuration = new Set<string>();
const warnedOpponentTurnEndNumeric = new Set<string>();

/**
 * Rejects opponent_turn_end on stat ops that carry a non-zero numeric delta.
 * Throws in NODE_ENV=test; warn-once in production (never isDev).
 */
export function rejectStatOpponentTurnEndNumericDelta(
  eff: StatOp,
  attack: number,
  defense: number,
  routeLabel = "stat",
): void {
  if (resolveStatDuration(eff) !== "opponent_turn_end") return;
  if (attack === 0 && defense === 0) return;
  const warnKey = `${routeLabel}:opponent_turn_end+numeric`;
  const msg =
    `[stat] duration:"opponent_turn_end" cannot carry non-zero attack/defense on route ${routeLabel}. ` +
    `Effect: ${JSON.stringify(eff)}`;
  if (readEnv("NODE_ENV") === "test") {
    throw new Error(msg);
  }
  if (!warnedOpponentTurnEndNumeric.has(warnKey)) {
    console.warn(msg);
    warnedOpponentTurnEndNumeric.add(warnKey);
  }
}

/**
 * Rejects action:"set" combined with any duration key.
 * Throws in NODE_ENV=test; warn-once in production (never isDev).
 */
export function rejectStatSetWithDuration(
  eff: StatOp,
  routeLabel = "stat",
): void {
  if (eff.action !== "set" || resolveStatDuration(eff) === "permanent") return;
  const warnKey = `${routeLabel}:set+duration`;
  const msg =
    `[stat] action:"set" cannot carry duration keys on route ${routeLabel}. ` +
    `Effect: ${JSON.stringify(eff)}`;
  if (readEnv("NODE_ENV") === "test") {
    throw new Error(msg);
  }
  if (!warnedStatSetDuration.has(warnKey)) {
    console.warn(msg);
    warnedStatSetDuration.add(warnKey);
  }
}

/**
 * Records a turn-scoped stat delta for later cleanup.
 * Only turn_end applies; opponent_turn_end numeric deltas are rejected upstream.
 */
export function recordTemporaryStatBuff(
  target: CardInstance,
  attack: number,
  defense: number,
  duration: StatDuration,
): void {
  if (duration !== "turn_end") return;
  if (!target.temporaryBuffs) target.temporaryBuffs = [];
  target.temporaryBuffs.push({
    attack,
    defense,
    id: state.rng.makeUid("buff_"),
  });
}

/**
 * Wraps an operation with duration logic (Permanent vs Temporary).
 * Resolves attack/defense through resolveDynamicValue (pooled route has no *_source).
 */
export function withBuffDuration(
  target: CardInstance,
  eff: StatOp,
  applyFn: (stats: { attack: number; defense: number }) => void,
  ctx: { owner?: Player; sourceCard?: CardInstance | null } = {},
) {
  const a = resolveDynamicValue(eff.attack as string | number | undefined, ctx);
  const d = resolveDynamicValue(
    eff.defense as string | number | undefined,
    ctx,
  );
  const duration = resolveStatDuration(eff);

  rejectStatOpponentTurnEndNumericDelta(eff, a, d, "pooled");
  recordTemporaryStatBuff(target, a, d, duration);
  applyFn({ attack: a, defense: d });
}
