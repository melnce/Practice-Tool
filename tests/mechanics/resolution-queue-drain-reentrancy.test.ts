/**
 * Resolution-queue drain must not re-enter through the damage batch (stack overflow).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { flushDeferredDeathBatch } from "../../src/logic/core/cleanup.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

const PING_PONG_TRIGGER = {
  event: "self_damaged",
  source: "board",
  effects: [
    {
      op: "damage",
      target: "enemy:follower",
      amount: 1,
      select: 1,
    },
  ],
};

function makePingPongFollower(
  name: string,
  owner: "first" | "second",
  uid: string,
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 20,
      triggers: [PING_PONG_TRIGGER],
    },
    "board",
    owner,
  );
  card.uid = uid;
  card.peak_defense = 20;
  applyKeywordsFromList(card);
  return card;
}

describe("resolution queue drain re-entrancy", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("self-damage ping-pong inside deferred drain never throws RangeError", () => {
    const ally = makePingPongFollower("Ally Ping", "first", "ally_ping");
    const enemy = makePingPongFollower("Enemy Ping", "second", "enemy_ping");
    state.players.first.board = [ally];
    state.players.second.board = [enemy];

    const fanfareSource = createCard(
      {
        name: "Fanfare Source",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        fanfare: [{ op: "damage", target: "all:followers", amount: 1 }],
      },
      "board",
      "first",
    );
    fanfareSource.uid = "fanfare_src";
    applyKeywordsFromList(fanfareSource);
    state.players.first.board.push(fanfareSource);

    expect(() => {
      runEffects([...fanfareSource.fanfare!], "first", fanfareSource, {
        deferDeathTriggers: true,
      });
      flushDeferredDeathBatch();
    }).not.toThrow(RangeError);

    expect(getResolutionQueue()).toHaveLength(0);
    for (const p of ["first", "second"] as const) {
      for (const c of state.players[p].board) {
        expect(Number(c.defense)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
