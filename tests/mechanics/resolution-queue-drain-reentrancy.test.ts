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
import {
  getResolutionDrainDepthForTests,
  resetResolutionDrainDepthForTests,
} from "../../src/logic/core/cleanup.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

/**
 * High defense so nested resume→flush cycles would overflow the stack on main
 * (game-54 path: deferDeathTriggers off during reactive drain lets
 * flushPendingSelfDamagedTriggers call resumeDeferredDeathIfIdle mid-drain).
 */
const PING_PONG_DEFENSE = 8000;

const PING_PONG_TRIGGER = {
  event: "self_damaged",
  source: "board",
  effects: [
    {
      op: "damage",
      target: "enemy:follower",
      amount: 1,
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
      defense: PING_PONG_DEFENSE,
      triggers: [PING_PONG_TRIGGER],
    },
    "board",
    owner,
  );
  card.uid = uid;
  card.peak_defense = PING_PONG_DEFENSE;
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
    resetResolutionDrainDepthForTests();
  });

  it("self-damage chain during reactive drain never re-enters flushDeferredDeathBatch", () => {
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
        // Must not defer: nested reactive runEffects during drain runs at depth 0,
        // and resumeDeferredDeathIfIdle must be reachable from exitDamageBatch
        // (matches soak game-54 overflow path on main).
        deferDeathTriggers: false,
      });
    }).not.toThrow(RangeError);

    expect(getResolutionDrainDepthForTests().max).toBeLessThanOrEqual(1);
    expect(getResolutionQueue()).toHaveLength(0);
    for (const p of ["first", "second"] as const) {
      for (const c of state.players[p].board) {
        expect(Number(c.defense)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
