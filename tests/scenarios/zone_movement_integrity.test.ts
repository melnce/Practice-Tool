import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  placeOnBoard,
  placeInGraveyard,
  placeInHand,
} from "../../src/logic/utils/zoneHelpers.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import { CardInstance } from "../../src/core/types.js";

// Minimal helpers since we don't have global helpers exposed
function getCard(id: string): CardInstance {
  return {
    uid: id,
    name: "TestUnit",
    type: "Follower",
    zone: "unknown",
    keywordState: {},
  } as any;
}

describe("Scenario: Zone Movement Integrity", () => {
  beforeEach(() => {
    resetGameState();
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("should maintain single-zone residency when moving Hand -> Board -> Grave", () => {
    const card = getCard("card_1");

    // 1. Start in Hand
    placeInHand(card, "blue");

    expect(card.zone).toBe("hand");
    expect(state.blueHand).toContain(card);
    expect(state.blueBoard).not.toContain(card);
    expect(state.blueGraveyard).not.toContain(card);

    // 2. Play to Board
    // Using direct helper to simulate operation effect, verifying state updates
    placeOnBoard(card, "blue");

    expect(card.zone).toBe("board");
    expect(state.blueHand).not.toContain(card); // Must be removed from hand
    expect(state.blueBoard).toContain(card);
    expect(state.blueGraveyard).not.toContain(card);

    // 3. Destroy to Graveyard
    placeInGraveyard(card, "blue");

    expect(card.zone).toBe("graveyard");
    expect(state.blueHand).not.toContain(card);
    expect(state.blueBoard).not.toContain(card); // Must be removed from board
    expect(state.blueGraveyard).toContain(card);
  });

  it("should handle opponent zone moves correctly", () => {
    const card = getCard("enemy_1");

    // Appear on enemy board
    placeOnBoard(card, "red");

    expect(card.zone).toBe("board"); // Zone enum is usually just 'board', context implies owner
    expect(state.redBoard).toContain(card);
    expect(state.blueBoard).not.toContain(card);

    // Banish (remove from board, do not add to grave)
    // (Simulating banish logic manually)
    const idx = state.redBoard.indexOf(card);
    state.redBoard.splice(idx, 1);
    card.zone = "void"; // Banish/Void

    expect(state.redBoard).not.toContain(card);
    expect(state.redGraveyard).not.toContain(card);
    expect(card.zone).toBe("void");
  });
});
