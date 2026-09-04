import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { pushToHand } from "../../src/core/utils.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";

function getCard(id: string): CardInstance {
  return {
    uid: id,
    name: "TestUnit",
    type: "Follower",
    zone: "unknown",
    keywordState: {},
    owner: "first",
  } as CardInstance;
}

function removeFromZone(
  card: CardInstance,
  player: PlayerSlot,
  zone: "hand" | "board" | "graveyard",
): void {
  const collection = state.players[player][zone];
  const idx = collection.indexOf(card);
  if (idx >= 0) collection.splice(idx, 1);
}

function placeOnBoard(card: CardInstance, player: PlayerSlot): void {
  removeFromZone(card, player, "hand");
  removeFromZone(card, player, "graveyard");
  card.zone = "board";
  card.owner = player;
  state.players[player].board.push(card);
}

function placeInHand(card: CardInstance, player: PlayerSlot): void {
  removeFromZone(card, player, "board");
  removeFromZone(card, player, "graveyard");
  pushToHand(state.players[player].hand, card);
  card.owner = player;
}

function placeInGraveyard(card: CardInstance, player: PlayerSlot): void {
  removeFromZone(card, player, "hand");
  removeFromZone(card, player, "board");
  card.zone = "graveyard";
  card.owner = player;
  state.players[player].graveyard.push(card);
}

describe("Scenario: Zone Movement Integrity", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("maintains single-zone residency when moving Hand -> Board -> Grave", () => {
    const card = getCard("card_1");

    placeInHand(card, "first");

    expect(card.zone).toBe("hand");
    expect(state.players.first.hand).toContain(card);
    expect(state.players.first.board).not.toContain(card);
    expect(state.players.first.graveyard).not.toContain(card);

    placeOnBoard(card, "first");

    expect(card.zone).toBe("board");
    expect(state.players.first.hand).not.toContain(card);
    expect(state.players.first.board).toContain(card);
    expect(state.players.first.graveyard).not.toContain(card);

    placeInGraveyard(card, "first");

    expect(card.zone).toBe("graveyard");
    expect(state.players.first.hand).not.toContain(card);
    expect(state.players.first.board).not.toContain(card);
    expect(state.players.first.graveyard).toContain(card);
  });

  it("handles opponent zone moves correctly", () => {
    const card = getCard("enemy_1");
    card.owner = "second";

    placeOnBoard(card, "second");

    expect(card.zone).toBe("board");
    expect(state.players.second.board).toContain(card);
    expect(state.players.first.board).not.toContain(card);

    const idx = state.players.second.board.indexOf(card);
    state.players.second.board.splice(idx, 1);
    card.zone = "banished";

    expect(state.players.second.board).not.toContain(card);
    expect(state.players.second.graveyard).not.toContain(card);
    expect(card.zone).toBe("banished");
  });
});
