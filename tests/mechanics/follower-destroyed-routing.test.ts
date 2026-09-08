/**
 * ally_follower_destroyed / enemy_follower_destroyed: fireTrigger() activePlayer
 * must be the destroyed follower's owner (conditions.ts:157-160). Listeners use
 * ally_/enemy_ prefix filters in process.ts:130.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  createCard,
  resetUidCounter,
  thenHP,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
  flushReactiveQueueOnly,
} from "../../src/logic/core/cleanup.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const SKELETON = "90051110";

function skeletonOnBoard(player: "first" | "second"): CardInstance {
  const c = createCard(SKELETON, "board", player);
  c.peak_defense = Number(c.defense);
  state.players[player].board.push(c);
  return c;
}

function destroyWatcher(
  player: "first" | "second",
  event: "ally_follower_destroyed" | "enemy_follower_destroyed",
) {
  const w = createCard(
    {
      name: `${event}-${player}`,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        {
          event,
          source: "board",
          effects: [
            { op: "restore", target: "leader", player: "self", amount: 1 },
          ],
        },
      ],
    },
    "board",
    player,
  );
  state.players[player].board.push(w);
  return w;
}

function destroyFollower(card: CardInstance) {
  card.defense = 0;
  cleanupDead();
  flushDeferredDeathBatch();
}

describe("follower_destroyed routing (2x2 probe)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("ally_follower_destroyed: only the destroyed follower's owner's ally listener fires", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHP(18)
      .withSecondHP(18)
      .build();
    destroyWatcher("first", "ally_follower_destroyed");
    destroyWatcher("second", "ally_follower_destroyed");

    destroyFollower(skeletonOnBoard("first"));
    expect(thenHP("first")).toBe(19);
    expect(thenHP("second")).toBe(18);

    resetUidCounter();
    givenGameState({ seed: 43, activePlayer: "first", roundCount: 6 })
      .withFirstHP(18)
      .withSecondHP(18)
      .build();
    destroyWatcher("first", "ally_follower_destroyed");
    destroyWatcher("second", "ally_follower_destroyed");

    destroyFollower(skeletonOnBoard("second"));
    expect(thenHP("first")).toBe(18);
    expect(thenHP("second")).toBe(19);
  });

  it("enemy_follower_destroyed: only the opponent of the destroyed follower's owner fires", () => {
    givenGameState({ seed: 44, activePlayer: "first", roundCount: 6 })
      .withFirstHP(18)
      .withSecondHP(18)
      .build();
    destroyWatcher("first", "enemy_follower_destroyed");
    destroyWatcher("second", "enemy_follower_destroyed");

    destroyFollower(skeletonOnBoard("second"));
    expect(thenHP("first")).toBe(19);
    expect(thenHP("second")).toBe(18);

    resetUidCounter();
    givenGameState({ seed: 45, activePlayer: "first", roundCount: 6 })
      .withFirstHP(18)
      .withSecondHP(18)
      .build();
    destroyWatcher("first", "enemy_follower_destroyed");
    destroyWatcher("second", "enemy_follower_destroyed");

    destroyFollower(skeletonOnBoard("first"));
    expect(thenHP("first")).toBe(18);
    expect(thenHP("second")).toBe(19);
  });
});

describe("Lifestealer (10553110) destruction-only healing", () => {
  const LIFESTEALER = "10553110";

  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  function lifestealerOnBoard() {
    const ls = createCard(LIFESTEALER, "board", "first");
    ls.peak_defense = Number(ls.defense);
    state.players.first.board.push(ls);
    return ls;
  }

  it("enemy Skeleton destroyed restores 1 leader HP (owner ruling: any Skeleton)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstHP(18)
      .build();
    lifestealerOnBoard();
    skeletonOnBoard("second");
    destroyFollower(state.players.second.board.find((c) => c.id === SKELETON)!);
    expect(thenHP("first")).toBe(19);
  });

  it("Skeleton bounced does not restore leader HP", () => {
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 10 })
      .withFirstHP(18)
      .build();
    lifestealerOnBoard();
    skeletonOnBoard("first");
    whenRunEffects(
      [
        {
          op: "return",
          destination: "hand",
          target: "ally:follower",
          filter: { name: "Skeleton" },
        },
      ],
      "first",
    );
    flushReactiveQueueOnly();
    flushDeferredDeathBatch();
    expect(thenHand("first").some((c) => c.name === "Skeleton")).toBe(true);
    expect(thenHP("first")).toBe(18);
  });

  it("Skeleton banished does not restore leader HP", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 10 })
      .withFirstHP(18)
      .build();
    lifestealerOnBoard();
    skeletonOnBoard("first");
    whenRunEffects([{ op: "banish", target: "ally:follower" }], "first");
    expect(thenHP("first")).toBe(18);
  });

  it("non-Skeleton destroyed does not restore leader HP", () => {
    givenGameState({ seed: 4, activePlayer: "first", roundCount: 10 })
      .withFirstHP(18)
      .build();
    lifestealerOnBoard();
    const other = createCard(
      {
        name: "NotASkeleton",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      "board",
      "first",
    );
    state.players.first.board.push(other);
    destroyFollower(other);
    expect(thenHP("first")).toBe(18);
  });
});
