/**
 * clash_opponent must resolve to the opposing combatant for every op (destroy, keyword, …),
 * not fall through to the ally board.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { getBoard, getGraveyard } from "../../src/core/playerHelpers.js";
import { isCantAttackLocked } from "../../src/logic/core/keywords/has.js";
import "../../src/logic/core/effects/index.js";

function readyAttacker(card: ReturnType<typeof createCard>) {
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  card.hasAttacked = false;
  card.justPlayed = false;
}

describe("clash_opponent context target", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("Armes (10654110) attacking — destroys defender, bystander and Armes survive", () => {
    const armes = createCard("10654110", "board", "first");
    armes.peak_defense = 10;
    readyAttacker(armes);

    const bystander = createCard(
      {
        name: "Ally Bystander",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 5,
      },
      "board",
      "first",
    );
    bystander.peak_defense = 5;

    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 20 },
      "board",
      "second",
    );
    foe.peak_defense = 20;

    state.players.first.board = [armes, bystander];
    state.players.second.board = [foe];

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "second").some((c) => c.uid === foe.uid)).toBe(
      false,
    );
    expect(getGraveyard(state, "second").some((c) => c.uid === foe.uid)).toBe(
      true,
    );
    expect(getBoard(state, "first").some((c) => c.uid === bystander.uid)).toBe(
      true,
    );
    expect(getBoard(state, "first").some((c) => c.uid === armes.uid)).toBe(
      true,
    );
  });

  it("Armes (10654110) defending — destroys the attacker", () => {
    const armes = createCard("10654110", "board", "second");
    armes.peak_defense = 10;

    const attacker = createCard(
      {
        name: "Enemy Attacker",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 20,
      },
      "board",
      "first",
    );
    attacker.peak_defense = 20;
    readyAttacker(attacker);

    state.players.first.board = [attacker];
    state.players.second.board = [armes];

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "first").some((c) => c.uid === attacker.uid)).toBe(
      false,
    );
    expect(
      getGraveyard(state, "first").some((c) => c.uid === attacker.uid),
    ).toBe(true);
    expect(getBoard(state, "second").some((c) => c.uid === armes.uid)).toBe(
      true,
    );
  });

  it("Illamrita (10704110) follower_strike — cant_attack lands on opposing follower, not allies", () => {
    const illamrita = createCard("10704110", "board", "first");
    illamrita.peak_defense = 4;
    readyAttacker(illamrita);

    const allyBystander = createCard(
      {
        name: "Ally Bystander",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 5,
      },
      "board",
      "first",
    );
    allyBystander.peak_defense = 5;

    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    foe.peak_defense = 5;

    state.players.first.board = [illamrita, allyBystander];
    state.players.second.board = [foe];

    attackFollower(0, 0, "first", "second");

    expect(isCantAttackLocked(foe)).toBe(true);
    expect(isCantAttackLocked(allyBystander)).toBe(false);
    expect(isCantAttackLocked(illamrita)).toBe(false);
  });
});
