// src/logic/core/effects/build.ts
// ─────────────────────────────────────────────────────────────────────────────
// EFFECT BUILDER - Provides type-safe effect construction with compile-time checks
// ─────────────────────────────────────────────────────────────────────────────

import { EffectOp, EffectByOp, Effect } from "../../../core/types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Type helpers for conditional payload requirements
// ─────────────────────────────────────────────────────────────────────────────

/** Safe indexing of EffectByOp - falls back to base effect if op not fully mapped */
type SafeEffectFor<K extends EffectOp> = K extends keyof EffectByOp
  ? EffectByOp[K]
  : { op: K } & Record<string, unknown>;

/** Extract the payload type (everything except 'op') */
type PayloadOf<K extends EffectOp> = K extends keyof EffectByOp
  ? Omit<EffectByOp[K], "op">
  : Record<string, unknown>;

/**
 * Get keys that are required (not optional) in T.
 * Uses the trick: {} extends Pick<T, P> is true only if P is optional.
 */
type RequiredKeys<T> = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  [P in keyof T]-?: {} extends Pick<T, P> ? never : P;
}[keyof T];

/** True if T has any required keys, false otherwise */
type HasRequiredKeys<T> = RequiredKeys<T> extends never ? false : true;

/**
 * Conditional args tuple:
 * - If payload has required keys: [payload: PayloadOf<K>] (required)
 * - If payload is all optional: [payload?: PayloadOf<K>] (optional)
 */
type MakeEffectArgs<K extends EffectOp> =
  HasRequiredKeys<PayloadOf<K>> extends true
    ? [payload: PayloadOf<K>]
    : [payload?: PayloadOf<K>];

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper with localized cast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal merge function with the single, localized cast.
 * TypeScript cannot infer { op, ...payload } as the correct effect type for generics.
 */
function mergeEffect<K extends EffectOp>(
  op: K,
  payload: PayloadOf<K>,
): SafeEffectFor<K> {
  return { op, ...payload } as SafeEffectFor<K>;
}

// ─────────────────────────────────────────────────────────────────────────────
// The builder function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a type-safe effect with compile-time payload validation.
 *
 * - Payload is REQUIRED if effect type has required fields
 * - Payload is OPTIONAL if all fields are optional (or there are none)
 *
 * Usage:
 *   makeEffect("damage", { amount: 5, target: "enemy_followers" })
 *   makeEffect("draw", { count: 2 })
 *   makeEffect("spellboost") // No payload needed if all fields optional
 *
 * @param op - The effect operation (narrowed to specific EffectOp literal)
 * @param args - Payload (required or optional based on effect type)
 * @returns A fully typed effect object
 */
export function makeEffect<K extends EffectOp>(
  op: K,
  ...args: MakeEffectArgs<K>
): SafeEffectFor<K> {
  // Cast allowed here because MakeEffectArgs ensures emptiness is valid when args[0] is undefined
  const payload = (args[0] ?? {}) as PayloadOf<K>;
  return mergeEffect(op, payload);
}

/**
 * Type guard to validate an unknown value is a valid effect.
 * Use at boundary layers (JSON parsing, user input) only.
 */
export function isValidEffect(value: unknown): value is Effect {
  if (typeof value !== "object" || value === null) return false;
  if (!("op" in value)) return false;
  if (typeof (value as { op: unknown }).op !== "string") return false;
  return true;
}















