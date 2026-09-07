/**
 * Card-set helpers for Shadowverse: Worlds Beyond (cosmetic only).
 *
 * Rotation legality for UI badges prefers `is_include_rotation` from
 * `cards/official-meta.json` (refreshed by `npm run cards:official`). When a
 * card id is absent from that snapshot, we fall back to Basic + the newest six
 * expansion sets derived from the set catalog.
 *
 * Source: official Deck Portal help “Build a Deck” — Rotation uses the six
 * latest card sets and basic cards. This module does **not** validate decks.
 */

import { getOfficialRotationFlag } from "./officialRotation.js";

/** Permanent Basic set id in Worlds Beyond card data. */
export const BASIC_SET_ID = "10000";

/** Rotation = Basic + this many newest expansion sets (heuristic fallback). */
export const ROTATION_EXPANSION_COUNT = 6;

/** Parse card `id` when it is a numeric catalog id. */
export function parseCardId(card: { id?: unknown }): string | null {
  if (card.id == null) return null;
  const id = String(card.id);
  return /^\d+$/.test(id) ? id : null;
}

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
 * Whether a card is in Rotation for cosmetic UI.
 * Prefers official per-card metadata; falls back to the set-window heuristic.
 */
export function isCardInRotation(
  card: { id?: unknown; set?: unknown },
  allSetIds: readonly string[],
  officialByCardId?: ReadonlyMap<string, boolean> | null,
): boolean {
  const cardId = parseCardId(card);
  const official = getOfficialRotationFlag(cardId, officialByCardId);
  if (official !== undefined) return official;
  return isRotationSetId(parseCardSetId(card), allSetIds);
}

/**
 * Compact set line for tooltips / lists.
 * Rotation sets: just the name. Older official sets: name + “older set”.
 * Unknown / vanilla: name only (or null if missing).
 */
export function formatSetBadge(
  card: { id?: unknown; set?: unknown },
  allSetIds: readonly string[],
  officialByCardId?: ReadonlyMap<string, boolean> | null,
): { text: string; inRotation: boolean; setId: string | null } | null {
  const name = parseCardSetName(card);
  if (!name) return null;
  const setId = parseCardSetId(card);
  if (!setId) {
    return { text: name, inRotation: false, setId: null };
  }
  const inRotation = isCardInRotation(card, allSetIds, officialByCardId);
  return {
    text: inRotation ? name : `${name} · older set`,
    inRotation,
    setId,
  };
}
