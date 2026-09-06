import type { CardInstance } from "../../../../core/types/index.js";
import type { UnifiedCostSpec } from "./types.js";

export interface TempCostSnapshot {
  cost_acc: number;
  cost_mod: number;
}

export function ensureBaseCost(card: CardInstance): number {
  if (card.base_cost === undefined) {
    card.base_cost = parseInt(String(card.cost), 10) || 0;
  }
  return parseInt(String(card.base_cost), 10) || 0;
}

/** Unclamped net offset from base_cost (reductions may accumulate below 0). */
export function getCostAcc(card: CardInstance): number {
  if (card.cost_acc !== undefined && card.cost_acc !== null) {
    return parseInt(String(card.cost_acc), 10) || 0;
  }
  const sb = parseInt(String(card.spellboostCostCount), 10) || 0;
  if (sb > 0) {
    return -sb;
  }
  const base = readBaseCost(card);
  const mod = parseInt(String(card.cost_mod), 10) || 0;
  if (mod !== 0) {
    return 0;
  }
  const displayed = parseInt(String(card.cost), 10) || 0;
  return displayed - base;
}

function readBaseCost(card: CardInstance): number {
  if (card.base_cost !== undefined) {
    return parseInt(String(card.base_cost), 10) || 0;
  }
  return parseInt(String(card.cost), 10) || 0;
}

export function setCostAcc(card: CardInstance, acc: number): void {
  card.cost_acc = acc;
  syncDisplayedCost(card);
}

export function getUncappedCost(card: CardInstance): number {
  const base = readBaseCost(card);
  const acc = getCostAcc(card);
  const mod = parseInt(String(card.cost_mod), 10) || 0;
  return base + acc + mod;
}

export function getEffectiveCostValue(
  card: CardInstance,
  minCost?: number,
): number {
  if (
    typeof card.effectiveCost === "number" &&
    Number.isFinite(card.effectiveCost)
  ) {
    return Math.max(minCost ?? 0, card.effectiveCost);
  }
  if ((card as { costModified?: number }).costModified != null) {
    return Math.max(
      minCost ?? 0,
      parseInt(String((card as { costModified?: number }).costModified), 10) ||
        0,
    );
  }
  const floor = minCost ?? 0;
  return Math.max(floor, getUncappedCost(card));
}

export function syncDisplayedCost(card: CardInstance): void {
  card.cost = getEffectiveCostValue(card);
}

export function saveTempCostSnapshot(card: CardInstance): void {
  if ((card as { temp_cost_snapshot?: TempCostSnapshot }).temp_cost_snapshot) {
    return;
  }
  (card as { temp_cost_snapshot?: TempCostSnapshot }).temp_cost_snapshot = {
    cost_acc: getCostAcc(card),
    cost_mod: parseInt(String(card.cost_mod), 10) || 0,
  };
  (card as { temp_cost_until_eot?: boolean }).temp_cost_until_eot = true;
}

export function applyCostChangeToCard(
  card: CardInstance,
  spec: Pick<UnifiedCostSpec, "mode" | "min_cost" | "until_eot">,
  amount: number,
): void {
  if (!card) return;
  ensureBaseCost(card);

  switch (spec.mode) {
    case "reduce": {
      if (spec.until_eot) saveTempCostSnapshot(card);
      setCostAcc(card, getCostAcc(card) - amount);
      if (spec.until_eot) {
        (
          card as { temp_cost_reduce_until_eot?: boolean }
        ).temp_cost_reduce_until_eot = true;
      }
      break;
    }

    case "set": {
      if (spec.until_eot) saveTempCostSnapshot(card);
      const base = ensureBaseCost(card);
      card.cost_acc = amount - base;
      card.cost_mod = 0;
      if (spec.until_eot) {
        (
          card as { temp_cost_set_until_eot?: boolean }
        ).temp_cost_set_until_eot = true;
      }
      syncDisplayedCost(card);
      break;
    }

    case "modify":
    case "increase": {
      if (spec.until_eot) saveTempCostSnapshot(card);
      setCostAcc(card, getCostAcc(card) + amount);
      if (spec.until_eot) {
        const prev =
          parseInt(
            String(
              (card as { temp_cost_mod_until_eot?: number })
                .temp_cost_mod_until_eot,
            ),
            10,
          ) || 0;
        (card as { temp_cost_mod_until_eot?: number }).temp_cost_mod_until_eot =
          prev + amount;
      }
      break;
    }
  }
}

export function applySpellboostCostReduction(
  card: CardInstance,
  reduceBy: number,
): void {
  ensureBaseCost(card);
  setCostAcc(card, getCostAcc(card) - reduceBy);
  card.spellboostCostCount = (card.spellboostCostCount || 0) + reduceBy;
}

export function applyHalveCurrentCost(card: CardInstance): void {
  const current = getEffectiveCostValue(card);
  if (current <= 1) return;
  ensureBaseCost(card);
  const halvedUp = Math.ceil(current / 2);
  const base = ensureBaseCost(card);
  const mod = parseInt(String(card.cost_mod), 10) || 0;
  card.cost_acc = halvedUp - base - mod;
  syncDisplayedCost(card);
}

export function restoreTempCostMods(cards: CardInstance[]): void {
  for (const card of cards) {
    const snap = (card as { temp_cost_snapshot?: TempCostSnapshot })
      .temp_cost_snapshot;
    const hasLegacy =
      (card as { temp_cost_set_until_eot?: boolean }).temp_cost_set_until_eot ||
      (card as { temp_cost_reduce_until_eot?: boolean })
        .temp_cost_reduce_until_eot ||
      (card as { temp_cost_until_eot?: boolean }).temp_cost_until_eot;
    const modDelta =
      parseInt(
        String(
          (card as { temp_cost_mod_until_eot?: number })
            .temp_cost_mod_until_eot,
        ),
        10,
      ) || 0;

    if (!snap && !hasLegacy && modDelta === 0) continue;

    if (snap) {
      card.cost_acc = snap.cost_acc;
      card.cost_mod = snap.cost_mod;
    } else if (
      (card as { temp_cost_set_until_eot?: boolean }).temp_cost_set_until_eot ||
      (card as { temp_cost_reduce_until_eot?: boolean })
        .temp_cost_reduce_until_eot
    ) {
      card.cost_acc = 0;
      card.cost_mod = 0;
      if (card.base_cost !== undefined) {
        card.cost = card.base_cost;
      }
    }
    if (modDelta !== 0 && !snap) {
      card.cost_mod = (parseInt(String(card.cost_mod), 10) || 0) - modDelta;
    }

    syncDisplayedCost(card);
    delete (card as { temp_cost_snapshot?: TempCostSnapshot })
      .temp_cost_snapshot;
    delete (card as { temp_cost_until_eot?: boolean }).temp_cost_until_eot;
    delete (card as { temp_cost_set_until_eot?: boolean })
      .temp_cost_set_until_eot;
    delete (card as { temp_cost_reduce_until_eot?: boolean })
      .temp_cost_reduce_until_eot;
    delete (card as { temp_cost_mod_until_eot?: number })
      .temp_cost_mod_until_eot;
  }
}
