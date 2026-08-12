import type { MulliganPolicy, SimCard } from "./types.js";

/**
 * Decide which opening-hand indices to mulligan (shuffle back).
 * Returns indices into the 4-card opening hand.
 */
export function mulliganIndices(
  opening: readonly SimCard[],
  policy: MulliganPolicy,
): number[] {
  if (policy.kind === "keep_all") return [];

  const keep = new Set(policy.keepKeys ?? []);
  const out: number[] = [];
  for (let i = 0; i < opening.length; i++) {
    const card = opening[i];
    if (!card) continue;
    if (!keep.has(card.key)) out.push(i);
  }
  return out;
}

/** True if this card key is a keep under the policy. */
export function isKeepKey(key: string, policy: MulliganPolicy): boolean {
  if (policy.kind === "keep_all") return true;
  return (policy.keepKeys ?? []).includes(key);
}
