/**
 * Seed normalisation at the game-start boundary.
 *
 * `state.seed` holds the literal user-facing value (what they typed / what was
 * generated / what the URL carried). `state.rng.seed` is the derived uint32
 * (`>>> 0`) the PRNG actually advances from. They are related but not equal
 * for values outside [0, 2^32).
 *
 * Rule: digit-only strings become numbers so `"12345"` and `12345` produce the
 * same game. Non-digit strings stay strings and are FNV-hashed by createRng.
 */

/** User-facing seed stored on `state.seed` and in share URLs. */
export type SeedLiteral = number | string;

/**
 * Canonicalise a seed so every entry path (startGame, resetGameState, QA
 * bridge, URL) yields the same game for the same characters.
 */
export function normalizeSeed(seed: number | string): SeedLiteral {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error(`[seed] Invalid seed: ${seed}`);
    }
    return seed;
  }
  const t = String(seed).trim();
  if (t === "") {
    throw new Error("[seed] Invalid seed: empty string");
  }
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (!Number.isFinite(n)) {
      throw new Error(`[seed] Invalid seed: ${seed}`);
    }
    return n;
  }
  return t;
}

/** True when `value` is a finite number or a digit-only string. */
export function isNumericSeed(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const t = value.trim();
    return t !== "" && /^\d+$/.test(t);
  }
  return false;
}

/**
 * Parse a raw UI / URL string into a seed literal, or null if empty/invalid
 * for numeric inputs (non-digit exotic strings are accepted as-is).
 */
export function parseSeedInput(raw: string): SeedLiteral | null {
  const t = raw.trim();
  if (!t) return null;
  return normalizeSeed(t);
}
