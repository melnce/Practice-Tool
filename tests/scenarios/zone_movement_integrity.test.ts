import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  placeOnBoard,
  placeInGraveyard,
  placeInHand,
} from "../../src/logic/utils/zoneHelpers.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import { CardInstance } from "../../src/core/types/index.js";

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
    resetGameState(1);
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("should maintain single-zone residency when moving Hand -> Board -> Grave", () => {
    const card = getCard("card_1");

    // 1. Start in Hand
    placeInHand(card, "first");

    expect(card.zone).toBe("hand");
    expect(state.players.first.hand).toContain(card);
    expect(state.players.first.board).not.toContain(card);
    expect(state.players.first.graveyard).not.toContain(card);

    // 2. Play to Board
    // Using direct helper to simulate operation effect, verifying state updates
    placeOnBoard(card, "first");

    expect(card.zone).toBe("board");
    expect(state.players.first.hand).not.toContain(card); // Must be removed from hand
    expect(state.players.first.board).toContain(card);
    expect(state.players.first.graveyard).not.toContain(card);

    // 3. Destroy to Graveyard
    placeInGraveyard(card, "first");

    expect(card.zone).toBe("graveyard");
    expect(state.players.first.hand).not.toContain(card);
    expect(state.players.first.board).not.toContain(card); // Must be removed from board
    expect(state.players.first.graveyard).toContain(card);
  });

  it("should handle opponent zone moves correctly", () => {
    const card = getCard("enemy_1");

    // Appear on enemy board
    placeOnBoard(card, "second");

    expect(card.zone).toBe("board"); // Zone enum is usually just 'board', context implies owner
    expect(state.players.second.board).toContain(card);
    expect(state.players.first.board).not.toContain(card);

    // Banish (remove from board, do not add to grave)
    // (Simulating banish logic manually)
    const idx = state.players.second.board.indexOf(card);
    state.players.second.board.splice(idx, 1);
    card.zone = "void"; // Banish/Void

    expect(state.players.second.board).not.toContain(card);
    expect(state.players.second.graveyard).not.toContain(card);
    expect(card.zone).toBe("void");
  });
});






