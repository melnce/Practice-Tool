/**
 * Shared reader for "pick targets at random" on effect ops.
 *
 * Canonical card spelling: `select_mode:"random"`.
 * Legacy spellings are accepted at runtime only; card data must use select_mode
 * (except `select` / `transform`, which also accept `mode:"random"`).
 */

export type RandomPickReaderOpts = {
  /** return deck route: legacy `distribution:"random"` */
  distributionRandom?: boolean;
  /** stat: legacy `distribution:"random"` and highest-stat tie-break among equals */
  statLegacy?: boolean;
};

/**
 * Returns true when the effect wants automatic random target selection
 * (not keyword-list randomness — see keyword/unified.ts).
 */
export function wantsRandomTargetPick(
  eff: Record<string, unknown>,
  opts?: RandomPickReaderOpts,
): boolean {
  if (String(eff.select_mode ?? "").toLowerCase() === "random") {
    return true;
  }
  if (eff.random === true) {
    return true;
  }
  if (String(eff.pick ?? "").toLowerCase() === "random") {
    return true;
  }
  if (String(eff.mode ?? "").toLowerCase() === "random") {
    return true;
  }

  const distribution = String(eff.distribution ?? "").toLowerCase();
  if (opts?.distributionRandom && distribution === "random") {
    return true;
  }

  if (opts?.statLegacy) {
    if (distribution === "random") {
      return true;
    }
    if (distribution === "highest" && eff.select != null) {
      return true;
    }
  }

  return false;
}
