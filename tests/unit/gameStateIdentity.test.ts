import { expect, test, describe } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { runEffects } from "../../src/logic/core/effects/index.js";

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

  test("Zooey MaxDamageCap does not leak across resetGameState", () => {
    resetGameState(1);
    state.players.first.hp = 20;

    runEffects(
      [
        {
          op: "keyword",
          action: "grant",
          target: "ally:leader",
          keywords: [
            {
              name: "MaxDamageCap",
              value: 0,
              duration: "opponent_turn_end",
            },
          ],
        },
      ],
      "first",
      null,
    );

    applyLeaderDamage("first", 5);
    expect(state.players.first.hp).toBe(20); // capped at 0

    resetGameState(2);
    state.players.first.hp = 20;
    applyLeaderDamage("first", 5);
    expect(state.players.first.hp).toBe(15); // must not still be capped
    expect((state as any).blueLeaderMaxDamageCap).toBeUndefined();
    expect((state as any).blueLeaderMaxDamageCapExpiry).toBeUndefined();
    expect(state.players.first.leaderMaxDamageCap).toBeNull();
  });
});
