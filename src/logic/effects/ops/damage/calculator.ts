// src/logic/effects/ops/damage/calculator.ts
// Pure damage amount calculation. No state mutation.

import { isOverflow } from "../../../../helpers/overflow.js";
import { resolveDynamicValue } from "../../../core/values.js";
import { Effect, Player, CardInstance } from "../../../../core/types/index.js";

export interface DamageAmountContext {
  owner: Player;
  sourceCard?: CardInstance | null;
  [key: string]: any;
}

export interface ResolvedDamage {
  baseAmount: number;
  addAmount: number;
  overflowAmount: number;
  finalAmount: number;
  isOverflowing: boolean;
}

/**
 * Resolves damage amount from an effect, handling overflow mechanics.
 * Pure function: does not mutate state.
 *
 * LEGACY: Overflow logic uses `amount_overflow` or `overflow_amount` as override.
 * If overflowing and override is present, it REPLACES base amount (not added to it).
 * `add_amount` is always added on top regardless of overflow state.
 */
export function resolveDamageAmount(
  eff: Effect,
  ctx: DamageAmountContext,
): ResolvedDamage {
  const baseRaw = eff.amount;
  const addRaw = (eff as any).add_amount;
  // LEGACY: Support both `amount_overflow` and `overflow_amount` aliases
  const ofRaw =
    (eff as any).amount_overflow ?? (eff as any).overflow_amount ?? baseRaw;

  const baseAmt = resolveDynamicValue(baseRaw, ctx);
  const addAmt = resolveDynamicValue(addRaw, ctx);
  const ofAmt = resolveDynamicValue(ofRaw, ctx);

  const checkOverflow = isOverflow(ctx.owner);

  // LEGACY: If overflowing, use override amount if present; otherwise use base.
  // ofRaw being defined OVERRIDES baseRaw, it does not add to it.
  const primary = checkOverflow && ofRaw != null ? ofAmt : baseAmt;

  return {
    baseAmount: baseAmt,
    addAmount: addAmt,
    overflowAmount: ofAmt,
    finalAmount: primary + addAmt,
    isOverflowing: checkOverflow,
  };
}

/**
 * Convenience wrapper that returns just the final amount (legacy signature compatibility).
 */
export function resolveAmountWithOverflow(
  eff: Effect,
  owner: Player,
  context: any = {},
): number {
  const ctx: DamageAmountContext = { ...context, owner };
  return resolveDamageAmount(eff, ctx).finalAmount;
}















