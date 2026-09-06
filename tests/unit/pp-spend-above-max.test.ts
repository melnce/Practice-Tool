/**
 * Regular PP may exceed maxPP when granted by effects/tests; spending must not
 * clamp the pool (only recover/refill clamp on raise).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import {
  getPP,
  getRegularPP,
  spendPP,
  recoverPP,
} from "../../src/core/playerHelpers.js";

describe("spendPP above maxPP", () => {
  beforeEach(() => {
    resetGameState(1);
    state.players.first.pp = 16;
    state.players.first.maxPP = 6;
    state.players.first.bonusPpOrb = 0;
  });

  it("spending 8 from 16 PP at max 6 leaves 8 (no clamp on spend)", () => {
    spendPP(state, "first", 8);
    expect(getRegularPP(state, "first")).toBe(8);
    expect(getPP(state, "first")).toBe(8);
  });

  it("recover clamps regular pool to maxPP when raising", () => {
    state.players.first.pp = 4;
    recoverPP(state, "first", 10);
    expect(getRegularPP(state, "first")).toBe(6);
    expect(getPP(state, "first")).toBe(6);
  });
});
