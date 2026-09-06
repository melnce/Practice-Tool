/**
 * Pins getCostAcc migration branches for cards that never received a cost op
 * on this branch (no cost_acc field yet).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../mechanics/setup.js";
import { createCard, resetUidCounter } from "../harness/builders.js";
import {
  getCostAcc,
  getEffectiveCostValue,
  setCostAcc,
} from "../../src/logic/effects/ops/cost/model.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { applyAlternateFormBaseCost } from "../../src/helpers/alternateForm.js";

describe("getCostAcc fallback branches", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("fresh card: no cost_acc — effective cost equals printed cost", () => {
    const card = createCard(
      { name: "Fresh", type: "Follower", cost: 5, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    expect(getCostAcc(card)).toBe(0);
    expect(getEffectiveCostValue(card)).toBe(5);
    expect(getEffectiveCost(card)).toBe(5);
  });

  it("spellboost-only card: infers acc from spellboostCostCount when cost_acc absent", () => {
    const card = createCard(
      {
        name: "Boosted",
        type: "Spell",
        cost: 10,
        keywords: [{ name: "Spellboost", reduceCostBy: 1, minCost: 0 }],
      },
      "hand",
      "first",
    );
    spellboostHand("first", 3, card);
    expect(card.cost_acc).toBe(-3);
    // Simulate a legacy snapshot without cost_acc (e.g. undo from older state)
    delete card.cost_acc;
    expect(getCostAcc(card)).toBe(-3);
    expect(getEffectiveCostValue(card)).toBe(7);
  });

  it("cost_mod only: acc is 0; mod carries the adjustment", () => {
    const card = createCard(
      { name: "Modded", type: "Spell", cost: 6, attack: 0, defense: 0 },
      "hand",
      "first",
    );
    card.cost_mod = -2;
    expect(getCostAcc(card)).toBe(0);
    expect(getEffectiveCostValue(card)).toBe(4);
  });

  it("raw cost write without cost_acc: displayed − base", () => {
    const card = createCard(
      { name: "Devotee", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    card.base_cost = 2;
    card.cost = 1;
    expect(getCostAcc(card)).toBe(-1);
    expect(getEffectiveCostValue(card)).toBe(1);
  });
});

describe("applyAlternateFormBaseCost clears cost modifiers", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("Spellboosted hand card played via Accelerate: effective cost is alternate N", () => {
    const card = createCard("10671110", "hand", "first"); // Shoddy, Accelerate 2
    setCostAcc(card, -3);
    expect(getEffectiveCostValue(card)).toBe(3);

    applyAlternateFormBaseCost(card, 2);
    expect(getEffectiveCostValue(card)).toBe(2);
    expect(getEffectiveCost(card)).toBe(2);
    expect(card.cost_acc).toBe(0);
    expect(card.cost_mod).toBe(0);
    expect(Number(card.base_cost)).toBe(2);
    expect(Number((card as any).originalPrintedBaseCost)).toBe(6);
  });
});
