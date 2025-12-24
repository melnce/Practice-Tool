import { describe, it, expect, beforeAll } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState";
import { playCard } from "../../../src/logic/core/playCard/index";
import { getCardDetails } from "../../../src/data/cardIndex";
import { initCardDatabaseNode } from "../../../src/data/cardLoaderNode";

function createCard(id: string, owner: "first" | "second") {
  const details = getCardDetails(id);
  if (!details) throw new Error(`Card not found: ${id}`);
  const card: any = { ...details };
  card.uid = state.rng.makeUid();
  card.owner = owner;
  if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
  return card;
}

describe("Ancestral Crown", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  it("should buff allied followers by +1/+1 when they enter", () => {
    resetGameState(1);
    state.isFirstPlayerTurn = true;
    state.players.first.pp = 10;

    // Play Ancestral Crown (Amulet ID: 10022210)
    const crown = createCard("10022210", "first");
    state.players.first.hand.push(crown);
    playCard(state.players.first.hand, "first", 0);

    const crownOnBoard = state.players.first.board[0];
    expect(crownOnBoard.name).toBe("Ancestral Crown");
    expect(crownOnBoard.keywordState?.hasAllyEnter).toBe(true);

    // Play Flashstep Quickblader (base 1/1, ID: 10021110)
    const follower = createCard("10021110", "first");
    expect(Number(follower.attack)).toBe(1);
    expect(Number(follower.defense)).toBe(1);

    state.players.first.hand.push(follower);
    playCard(state.players.first.hand, "first", 0);

    const played = state.players.first.board.find((c) => c.type === "Follower");
    expect(played).toBeDefined();
    expect(Number(played!.attack)).toBe(2); // 1 base + 1 buff
    expect(Number(played!.defense)).toBe(2); // 1 base + 1 buff
  });
});






