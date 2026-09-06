/**
 * Sathanid, Eld Lance (10614120) — Mar 30 balance: faith evolve trigger
 * damages enemy leader only, not enemy followers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import { getHP, getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const SATHANID = "10614120";
const FAITH_CREST = faithCrestNameForCard("Sathanid, Eld Lance");

describe("Sathanid faith evolve trigger (10614120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("granted faith trigger damages enemy leader only when ally evolves", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([SATHANID])
      .withFirstPP(1, 6)
      .build();

    bootstrapFaithForPlayer(
      "first",
      state.players.first.deck,
      state.players.first.hand,
    );
    crestAddCounter("first", FAITH_CREST, "faith", 10);

    const enemyFollower = createCard(
      { name: "EnemyF", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemyFollower.peak_defense = 5;
    state.players.second.board = [enemyFollower];

    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];

    const leaderHpBefore = getHP(state, "second");
    const followerDefBefore = Number(enemyFollower.defense);

    whenPlayCard("first", 0);
    whenEffectEvolve(ally, "first", "normal");

    expect(getHP(state, "second")).toBe(leaderHpBefore - 1);
    const enemyOnBoard = getBoard(state, "second").find(
      (c) => c.uid === enemyFollower.uid,
    );
    expect(enemyOnBoard).toBeTruthy();
    expect(Number(enemyOnBoard!.defense)).toBe(followerDefBefore);
  });
});
