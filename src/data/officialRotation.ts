/**
 * Per-card rotation flags from `cards/official-meta.json` (Cygames snapshot).
 *
 * UI and gates consult `is_include_rotation` per card id. When a card id is
 * absent from the metadata (e.g. freshly ingested before `cards:official`),
 * callers fall back to the set-window heuristic in `formats.ts`.
 */

const OFFICIAL_META_HEADER_KEY = "_meta";

export type OfficialRotationSnapshot = {
  fetchedAt: string | null;
  byCardId: ReadonlyMap<string, boolean>;
};

let cachedSnapshot: OfficialRotationSnapshot | null = null;

/** Build a card-id → rotation lookup, skipping `_meta` and non-numeric keys. */
export function buildOfficialRotationSnapshot(
  raw: Record<string, unknown>,
): OfficialRotationSnapshot {
  const byCardId = new Map<string, boolean>();
  let fetchedAt: string | null = null;

  for (const [key, value] of Object.entries(raw)) {
    if (key === OFFICIAL_META_HEADER_KEY) {
      if (value && typeof value === "object") {
        const at = (value as { fetched_at?: unknown }).fetched_at;
        fetchedAt = typeof at === "string" ? at : null;
      }
      continue;
    }
    if (!/^\d+$/.test(key)) continue;
    if (!value || typeof value !== "object") continue;
    const flag = (value as { is_include_rotation?: unknown })
      .is_include_rotation;
    if (typeof flag === "boolean") {
      byCardId.set(key, flag);
    }
  }

  return { fetchedAt, byCardId };
}

export function initOfficialRotationFromJson(
  raw: Record<string, unknown>,
): void {
  cachedSnapshot = buildOfficialRotationSnapshot(raw);
}

export function getOfficialRotationSnapshot(): OfficialRotationSnapshot | null {
  return cachedSnapshot;
}

export function resetOfficialRotationForTests(): void {
  cachedSnapshot = null;
}

export function getOfficialRotationFlag(
  cardId: string | null | undefined,
  officialByCardId?: ReadonlyMap<string, boolean> | null,
): boolean | undefined {
  if (!cardId) return undefined;
  const lookup = officialByCardId ?? cachedSnapshot?.byCardId;
  if (!lookup?.has(cardId)) return undefined;
  return lookup.get(cardId);
}
