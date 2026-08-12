/**
 * Card-set helpers for Shadowverse: Worlds Beyond (cosmetic only).
 *
 * Rotation window (for optional UI marking): Basic + the newest six expansion
 * sets, derived from the set catalog — never a hardcoded set-id list.
 *
 * Source: official Deck Portal help “Build a Deck” — Rotation uses the six
 * latest card sets and basic cards. This module does **not** validate decks.
 */

/** Permanent Basic set id in Worlds Beyond card data. */
export const BASIC_SET_ID = "10000";

/** Rotation = Basic + this many newest expansion sets. */
export const ROTATION_EXPANSION_COUNT = 6;

/** Parse `[10003] Heirs of the Omen` → `"10003"`. */
export function parseCardSetId(card: { set?: unknown }): string | null {
  if (typeof card.set !== "string") return null;
  const m = card.set.match(/\[(\d+)\]/);
  return m?.[1] ?? null;
}

/**
 * Human-facing set name from the card's `set` field.
 * `[10003] Heirs of the Omen` → `"Heirs of the Omen"`;
 * `[VANILLA] Custom` → `"Custom"`.
 */
export function parseCardSetName(card: { set?: unknown }): string | null {
  if (typeof card.set !== "string") return null;
  const trimmed = card.set.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^\[[^\]]+\]\s*(.+)$/);
  return (m?.[1] ?? trimmed).trim() || null;
}

/** Sorted unique numeric set ids from a card collection. */
export function collectSetIds(cards: Iterable<{ set?: unknown }>): string[] {
  const ids = new Set<string>();
  for (const card of cards) {
    const id = parseCardSetId(card);
    if (id) ids.add(id);
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

/**
 * Set ids currently in the Rotation window: Basic + newest
 * {@link ROTATION_EXPANSION_COUNT} expansions (by numeric set id).
 */
export function rotationSetIds(setIds: readonly string[]): ReadonlySet<string> {
  const sorted = [...setIds].sort((a, b) => Number(a) - Number(b));
  const expansions = sorted.filter((id) => id !== BASIC_SET_ID);
  const window = expansions.slice(-ROTATION_EXPANSION_COUNT);
  const legal = new Set(window);
  if (sorted.includes(BASIC_SET_ID)) legal.add(BASIC_SET_ID);
  return legal;
}

export function isRotationSetId(
  setId: string | null | undefined,
  allSetIds: readonly string[],
): boolean {
  if (!setId) return false;
  return rotationSetIds(allSetIds).has(setId);
}

/**
 * Compact set line for tooltips / lists.
 * Rotation sets: just the name. Older official sets: name + “older set”.
 * Unknown / vanilla: name only (or null if missing).
 */
export function formatSetBadge(
  card: { set?: unknown },
  allSetIds: readonly string[],
): { text: string; inRotation: boolean; setId: string | null } | null {
  const name = parseCardSetName(card);
  if (!name) return null;
  const setId = parseCardSetId(card);
  if (!setId) {
    return { text: name, inRotation: false, setId: null };
  }
  const inRotation = isRotationSetId(setId, allSetIds);
  return {
    text: inRotation ? name : `${name} · older set`,
    inRotation,
    setId,
  };
}
