/**
 * Exact hypergeometric helpers for analytic checks against Monte Carlo.
 * Uses multiplicative formula to stay within float precision for N≈40.
 */

/** C(n, k) via multiplicative formula. */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    result *= n - kk + i;
    result /= i;
  }
  return result;
}

/**
 * P(X = k) where X ~ Hypergeometric(N population, K successes, n draws).
 */
export function hypergeometricPmf(
  population: number,
  successes: number,
  draws: number,
  k: number,
): number {
  const denom = combinations(population, draws);
  if (denom === 0) return 0;
  return (
    (combinations(successes, k) *
      combinations(population - successes, draws - k)) /
    denom
  );
}

/** P(X >= 1) = 1 - C(N-K, n) / C(N, n). */
export function hypergeometricAtLeastOne(
  population: number,
  successes: number,
  draws: number,
): number {
  const denom = combinations(population, draws);
  if (denom === 0) return 0;
  return 1 - combinations(population - successes, draws) / denom;
}

/**
 * Closed form used by the correctness test:
 * P(at least one of `copies` identical cards in an opening hand of `handSize`
 * from a `deckSize` deck), no mulligan.
 */
export function pAtLeastOneInOpening(
  copies: number,
  deckSize: number,
  handSize: number,
): number {
  return hypergeometricAtLeastOne(deckSize, copies, handSize);
}
