/**
 * Shared helpers for pool-narrowing `filter` / `condition` objects on effect ops.
 */

/**
 * Read a pool-narrowing filter from an effect, accepting both spellings.
 * Precedence: `filter` wins over `filters` (canonical spelling).
 *
 * EXCLUDED OPS — do NOT route these through this reader; their `filter` means
 * something else:
 *
 * | op | what `filter` actually means | evidence |
 * |----|------------------------------|----------|
 * | damage | an **amount** computation | damage/helpers.ts:73-111; card 10674110 Camiscilla |
 * | repeat_effect | a **repeat count** | repeat.ts:35-40; card 10114130 Amataz |
 * | stat with attack_source/defense_source | **buff magnitude** | self.ts:134-140, :176-182 |
 * | summon/add_to_hand/deck with source:"destroyed_match" | filters a **history log**, not a live zone | destroyedHistory.ts:19-25 |
 * | summon from hand/graveyard | a **dispatch discriminant** — filter.type picks handler | summon/handlers.ts:120,206 |
 * | countdown | aliased into **board_name**, a name lookup | countdown/unified.ts:87,172 |
 * | stat with filter:"leftmost" | a **positional selector** applied after the pool | stat/utils.ts:87; card 10423310 |
 */
export function readPoolNarrowFilter(
  eff: Record<string, unknown>,
): Record<string, unknown> | null {
  const filter = eff.filter;
  if (filter != null && typeof filter === "object" && !Array.isArray(filter)) {
    return filter as Record<string, unknown>;
  }
  const filters = eff.filters;
  if (
    filters != null &&
    typeof filters === "object" &&
    !Array.isArray(filters)
  ) {
    return filters as Record<string, unknown>;
  }
  return null;
}

/**
 * Merge object-valued `condition` and `filter` for getPool / applyFilters.
 * Precedence: filter keys win on collision. Empty merge returns `{}`.
 */
export function mergePoolCondition(
  condition: unknown,
  filter: unknown,
): Record<string, unknown> {
  const base =
    condition && typeof condition === "object" && !Array.isArray(condition)
      ? { ...(condition as Record<string, unknown>) }
      : {};
  if (filter && typeof filter === "object" && !Array.isArray(filter)) {
    return { ...base, ...(filter as Record<string, unknown>) };
  }
  return base;
}

/** Merge `condition` + object `filter` from a select/stat/destroy-style effect. */
export function mergeEffectPoolCondition(eff: {
  condition?: unknown;
  filter?: unknown;
}): Record<string, unknown> {
  return mergePoolCondition(eff.condition, eff.filter);
}
