/**
 * Batch 8 — Clash trigger primitive (follower vs follower combat).
 * Wired in combat.ts → fireTrigger("clash") → damage target clash_opponent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  findOnBoard,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import "../../src/logic/core/effects/index.js";

describe("Clash primitive — event clash + clash_opponent damage", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Eustace Clash subtracts 3 before strike damage in follower combat", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10472110"])
      .withFirstPP(5, 6)
      .build();
    whenPlayCard("first", 0);
    const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
    eustace.can_attack = true;
    eustace.can_attack_followers = true;
    eustace.attacks_left = 1;
    eustace.hasAttacked = false;

    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 10 },
      "board",
      "second",
    );
    foe.peak_defense = 10;
    state.players.second.board = [foe];

    attackFollower(0, 0, "first", "second");
    expect(Number(foe.defense)).toBe(2);
  });
});
