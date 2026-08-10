/**
 * M7 — Super-evolution knockback must route through applyLeaderDamage
 * (Zooey cap, leader Barrier, damage modifiers).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { grantLeaderBarrier } from "../../src/logic/effects/leader.js";
import { getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("super-evo knockback damage pipeline", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  function setupSuperEvoAttackerVsFodder() {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 8 })
      .withFirstPP(10, 10)
      .build();

    const attacker = createCard(
      {
        name: "Super Striker",
        type: "Follower",
        cost: 3,
        attack: 5,
        defense: 5,
      },
      "board",
      "first",
    );
    attacker.peak_defense = 5;
    attacker.evoType = "super";
    attacker.hasEvolved = true;
    attacker.can_attack = true;
    attacker.attacks_left = 1;
    attacker.justPlayed = false;
    applyKeywordsFromList(attacker);

    const fodder = createCard(
      { name: "Fodder", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "second",
    );
    fodder.peak_defense = 1;
    applyKeywordsFromList(fodder);

    state.players.first.board = [attacker];
    state.players.second.board = [fodder];
    state.players.second.hp = 20;
    return { attacker, fodder };
  }

  it("knockback respects leader max-damage cap on the defending leader", () => {
    setupSuperEvoAttackerVsFodder();
    state.players.second.leaderMaxDamageCap = 0;

    attackFollower(0, 0, "first", "second");
    expect(getHP(state, "second")).toBe(20);
  });

  it("knockback pops leader Barrier instead of reducing HP", () => {
    setupSuperEvoAttackerVsFodder();
    grantLeaderBarrier("second");
    const hpBefore = getHP(state, "second");

    attackFollower(0, 0, "first", "second");

    expect(state.players.second.leaderBarrier).toBe(0);
    expect(getHP(state, "second")).toBe(hpBefore);
  });
});
