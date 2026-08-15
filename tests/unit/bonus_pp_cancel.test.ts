/**
 * Regression: Bonus PP cancel must not drive PP negative after the orb is spent.
 * Seed-derived from soak smoke (424242 / game 0) — general engine fix, no card special-case.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import {
  toggleSecondPlayerBonusPp,
  canToggleSecondPlayerBonusPp,
} from "../../src/core/bonusPp.js";
import {
  getPP,
  setPP,
  setMaxPP,
  getMaxPP,
} from "../../src/core/playerHelpers.js";

describe("Bonus PP cancel after spend", () => {
  beforeEach(() => {
    resetGameState(9001);
    state.phase = "main";
    state.activePlayer = "second";
    state.roundCount = 3;
    state.secondPlayerPPBoostUsedEarly = false;
    state.secondPlayerPPBoostUsedLate = false;
    state.secondPlayerPPBoostPending = false;
    setMaxPP(state, "second", 3);
    setPP(state, "second", 3);
  });

  it("activate then cancel while unspent refunds the orb", () => {
    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(4);
    expect(state.secondPlayerPPBoostPending).toBe(true);

    expect(canToggleSecondPlayerBonusPp()).toBe(true);
    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(3);
    expect(state.secondPlayerPPBoostPending).toBe(false);
  });

  it("cancel after spending the bonus orb does not go negative", () => {
    expect(toggleSecondPlayerBonusPp()).toBe(true);
    expect(getPP(state, "second")).toBe(4);

    // Spend all usable PP including the bonus orb
    setPP(state, "second", 0);
    expect(getPP(state, "second")).toBe(0);
    expect(getMaxPP(state, "second")).toBe(3);
    expect(canToggleSecondPlayerBonusPp()).toBe(false);

    expect(toggleSecondPlayerBonusPp()).toBe(false);
    expect(getPP(state, "second")).toBe(0);
    // Charge still pending — end of turn commits usedEarly/Late
    expect(state.secondPlayerPPBoostPending).toBe(true);
  });

  it("cancel after partial spend down to maxPP does not refund", () => {
    toggleSecondPlayerBonusPp(); // 4/3
    setPP(state, "second", 3); // spent the bonus orb only
    expect(canToggleSecondPlayerBonusPp()).toBe(false);
    expect(toggleSecondPlayerBonusPp()).toBe(false);
    expect(getPP(state, "second")).toBe(3);
    expect(state.secondPlayerPPBoostPending).toBe(true);
  });
});
