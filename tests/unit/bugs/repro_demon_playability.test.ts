import { describe, it, expect, beforeEach } from "vitest";
import { canPlayCard } from "../../../src/logic/core/playCard/preflight";
import { state, createInitialState } from "../../../src/core/gameState";
import { CardInstance } from "../../../src/core/types";

describe("Demon of Purgatory Playability", () => {
  beforeEach(() => {
    Object.assign(state, createInitialState());
  });

  it("should be playable even if no enemy followers are on board", () => {
    const demon: CardInstance = {
      id: "90004130",
      name: "Demon of Purgatory",
      cost: 5,
      type: "Follower",
      description: "Fanfare: Select 2 enemy followers...",
      fanfare: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 6,
          select: 2,
        },
        {
          op: "damage",
          target: "enemy:leader",
          amount: 6,
        },
      ],
      keywords: [],
      uid: "100",
    };

    // Ensure we have PP
    state.bluePP = 5;
    state.blueMaxPP = 5;
    state.blueHand = [demon];
    state.redBoard = []; // No enemies

    const result = canPlayCard(demon, "blue");

    // This should fail currently, but we want it to PASS
    if (!result.ok) {
      console.log(
        "Playability check failed as expected (for reproduction):",
        result.reason,
      );
    }

    // We assert true because we want to fix it to be true
    expect(result.ok).toBe(true);
  });
});
