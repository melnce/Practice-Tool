/**
 * Targeting — enemy:hand pool resolution.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getPool } from "../../src/logic/core/targeting.js";

describe("targeting — enemy:hand pools", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it('getPool("enemy:hand") returns the opponent\'s hand', () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const oppFollower = createCard(
      { name: "OppFollower", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "hand",
      "second",
    );
    const oppSpell = createCard(
      { name: "OppSpell", type: "Spell", cost: 1 },
      "hand",
      "second",
    );
    state.players.second.hand.push(oppFollower, oppSpell);

    const allyHand = createCard(
      { name: "AllyHand", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    state.players.first.hand.push(allyHand);

    const pool = getPool("enemy:hand", "first", null, {});
    const uids = pool.map((c) => c.uid);

    expect(uids).toContain(oppFollower.uid);
    expect(uids).toContain(oppSpell.uid);
    expect(uids).not.toContain(allyHand.uid);
  });

  it('getPool("enemy:hand:follower") returns only opponent hand followers', () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const oppFollower = createCard(
      { name: "OppFollower", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "hand",
      "second",
    );
    const oppSpell = createCard(
      { name: "OppSpell", type: "Spell", cost: 1 },
      "hand",
      "second",
    );
    state.players.second.hand.push(oppFollower, oppSpell);

    const pool = getPool("enemy:hand:follower", "first", null, {});
    const uids = pool.map((c) => c.uid);

    expect(uids).toEqual([oppFollower.uid]);
  });

  it('getPool("ally:hand:follower") returns only owner hand followers', () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const allyFollower = createCard(
      {
        name: "AllyFollower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      "hand",
      "first",
    );
    const allySpell = createCard(
      { name: "AllySpell", type: "Spell", cost: 1 },
      "hand",
      "first",
    );
    state.players.first.hand.push(allyFollower, allySpell);

    const pool = getPool("ally:hand:follower", "first", null, {});
    const uids = pool.map((c) => c.uid);

    expect(uids).toEqual([allyFollower.uid]);
  });

  it('getPool("ally:hand") still returns the owner\'s full hand', () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const allyFollower = createCard(
      {
        name: "AllyFollower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      "hand",
      "first",
    );
    const allySpell = createCard(
      { name: "AllySpell", type: "Spell", cost: 1 },
      "hand",
      "first",
    );
    state.players.first.hand.push(allyFollower, allySpell);

    const pool = getPool("ally:hand", "first", null, {});
    const uids = pool.map((c) => c.uid);

    expect(uids).toContain(allyFollower.uid);
    expect(uids).toContain(allySpell.uid);
  });
});
