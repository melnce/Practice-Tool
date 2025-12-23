import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState";
import { playCard } from "../../../src/logic/core/playCard";
import { CardInstance } from "../../../src/core/types";
import { loadCardDatabase } from "../../../src/data/cardDatabase";

// Mock makeUid locally
const makeUid = () => "test_uid_" + Math.random().toString(36).slice(2);

describe("Bug 1: Earth Sigils Initialization", () => {
  beforeAll(async () => {
    await loadCardDatabase();
  });

  beforeEach(() => {
    resetGameState();
    state.bluePP = 10;
    state.blueMaxPP = 10;
    state.isBlueTurn = true;
  });

  it("Witchs New Brew should start with 1 earth counter", () => {
    // Construct card matching 10031210 definition
    const brew: CardInstance = {
      id: "10031210",
      uid: makeUid(),
      name: "Witch's New Brew",
      type: "Amulet",
      cost: 1,
      owner: "blue",
      keywords: [
        {
          name: "Counter",
          key: "earth",
          count: 1,
          destroyOnEmpty: true,
        },
      ] as any,
    };

    state.blueHand = [brew];

    // playCard(hand, player, index)
    playCard(state.blueHand, "blue", 0);

    const playedBrew = state.blueBoard[0];
    expect(playedBrew).toBeDefined();
    // The bug is that it starts at 0 or undefined despite keyword
    expect(playedBrew.counters?.earth).toBe(1);
  });

  it("Magic Sediment should start with 1 earth counter (Token fallback)", () => {
    // Create Magic Sediment without keywords to test initAmulet fallback logic
    const sediment: CardInstance = {
      id: "90031210",
      uid: makeUid(),
      name: "Magic Sediment",
      type: "Amulet",
      cost: 0,
      owner: "blue",
      keywords: [],
    };

    state.blueHand = [sediment];
    playCard(state.blueHand, "blue", 0);

    const played = state.blueBoard[0];
    expect(played).toBeDefined();
    expect(played.name).toBe("Magic Sediment");
    expect(played.counters?.earth).toBe(1);
  });
});
