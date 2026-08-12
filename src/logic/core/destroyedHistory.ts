import type {
  CardInstance,
  GameState,
  Player,
} from "../../core/types/index.js";

export type DestroyedRecord = {
  uid: string;
  name: string;
  type: string;
  id: string;
  cost: number;
  baseCost: number;
  tribes: string[];
  hasLastWords: boolean;
  cardId: string;
};

export type DestroyedMatchFilter = {
  type?: string;
  tribe?: string;
  hasLastWords?: boolean;
  baseCost_lte?: number;
  base_cost_lte?: number;
};

export type DestroyedMatchOptions = DestroyedMatchFilter & {
  filter?: DestroyedMatchFilter;
  count?: number;
  distinct_by?: string;
  distribution?: string;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Record a destroyed card without retaining mutable runtime card state. */
export function recordDestroyed(
  state: GameState,
  owner: Player,
  card: CardInstance,
): void {
  const cost = finiteNumber(card.cost);
  const baseCost = finiteNumber(
    card.originalCost ?? card.base_cost ?? card.cost,
    cost,
  );
  const id = String(card.id ?? "");

  state.players[owner].destroyedHistory.push({
    uid: String(card.uid ?? ""),
    name: String(card.name ?? ""),
    type: String(card.type ?? ""),
    id,
    cost,
    baseCost,
    tribes: Array.isArray(card.tribes)
      ? card.tribes.map((tribe) => String(tribe))
      : [],
    hasLastWords: !!card.hasLastWords,
    cardId: id,
  });
}

/** Pick matching destroyed cards without replacement using the match RNG. */
export function pickDestroyedMatch(
  state: GameState,
  owner: Player,
  opts: DestroyedMatchOptions = {},
): DestroyedRecord[] {
  const filter = { ...opts, ...(opts.filter ?? {}) };
  const wantedType = String(filter.type ?? "").toLowerCase();
  const wantedTribe = String(filter.tribe ?? "").toLowerCase();
  const baseCostLimitRaw = filter.baseCost_lte ?? filter.base_cost_lte;
  const baseCostLimit =
    baseCostLimitRaw == null ? null : finiteNumber(baseCostLimitRaw, NaN);

  let candidates = state.players[owner].destroyedHistory.filter((record) => {
    if (wantedType && String(record.type ?? "").toLowerCase() !== wantedType) {
      return false;
    }
    if (
      wantedTribe &&
      !(record.tribes ?? []).some(
        (tribe) => String(tribe).toLowerCase() === wantedTribe,
      )
    ) {
      return false;
    }
    if (
      filter.hasLastWords != null &&
      !!record.hasLastWords !== !!filter.hasLastWords
    ) {
      return false;
    }
    if (
      baseCostLimit != null &&
      finiteNumber(record.baseCost ?? record.cost) > baseCostLimit
    ) {
      return false;
    }
    return true;
  });

  if (String(opts.distinct_by ?? "").toLowerCase() === "name") {
    const seen = new Set<string>();
    candidates = candidates.filter((record) => {
      if (seen.has(record.name)) return false;
      seen.add(record.name);
      return true;
    });
  }

  const count = Math.max(0, Math.floor(finiteNumber(opts.count, 1)));
  const pool = [...candidates];
  const picked: DestroyedRecord[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = state.rng.nextInt(pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}
