/**
 * Regression: dual-zone UID — summonExactCopyFromHand must mint a new uid.
 * Mechanism (soak seed 20260815 games 60/284/324): Artifact hand-copy summon
 * (`source:"hand", mode:"copy"`) cloned Striker Artifact onto the board while
 * keeping the hand instance's uid → hand + board shared one identity.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { summonExactCopyFromHand } from "../../src/logic/effects/ops/summon_ops/hand.js";
import { checkSoakInvariants } from "../../src/bench/soakInvariants.js";

describe("zone identity: summonExactCopyFromHand", () => {
  beforeEach(() => {
    resetGameState(20260815);
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("board copy gets a distinct uid; hand original stays in hand only", () => {
    const handCard = {
      uid: "hand_striker",
      id: "90072110",
      name: "Striker Artifact",
      type: "Follower",
      attack: 3,
      defense: 2,
      cost: 3,
      owner: "first",
      zone: "hand",
      tribes: ["Artifact"],
      keywords: [],
      triggers: [],
    } as any;

    state.players.first.hand = [handCard];
    state.players.first.board = [];

    const copy = summonExactCopyFromHand(handCard, "first");
    expect(copy).toBeTruthy();
    expect(copy!.uid).not.toBe(handCard.uid);
    expect(copy!.zone).toBe("board");

    expect(state.players.first.hand).toHaveLength(1);
    expect(state.players.first.hand[0]).toBe(handCard);
    expect(handCard.zone).toBe("hand");

    expect(state.players.first.board).toHaveLength(1);
    expect(state.players.first.board[0]).toBe(copy);

    const findings = checkSoakInvariants(state);
    expect(
      findings.filter((f) => /two zones|Duplicate UID/i.test(f.message)),
    ).toEqual([]);
  });
});
