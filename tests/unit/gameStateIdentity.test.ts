import { expect, test, describe } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct";

describe("GameState Identity", () => {
  test("arrays are reset properly after resetGameState", () => {
    // Initialize state
    resetGameState(1);

    // Modify arrays
    state.players.first.deck.push({ uid: "test" } as any);
    state.lastSummoned!.push({ uid: "test" } as any);

    // Reset and verify arrays are cleared
    resetGameState(1);

    // Note: With nested player structure, resetGameState creates fresh PlayerState objects
    // So identity is not preserved, but data should be reset
    expect(state.players.first.deck.length).toBe(0);
    expect(state.players.first.hand.length).toBe(0);

    expect(state.lastSummoned).toBeDefined();
    expect(state.lastSummoned!.length).toBe(0);
  });

  test("summonNamed preserves lastSummoned identity", () => {
    resetGameState(1);
    const lsRef = state.lastSummoned;
    state.lastSummoned!.push({ uid: "prev" } as any);

    // Call summonNamed with invalid card to trigger the clear logic (start of function)
    // without needing DB setup or side effects.
    summonNamed(
      { op: "summon_named", name: "INVALID_CARD_999" } as any,
      "first",
    );

    expect(state.lastSummoned).toBe(lsRef);
    expect(state.lastSummoned!.length).toBe(0);
  });
});
