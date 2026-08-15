/**
 * Regression: board may contain null placeholders during deferred Last Words
 * (cleanup.ts). Post-fanfare resume must not crash when scanning the board.
 * Repro path: soak seed 424242 gameIndex 1 (CHOOSE_TARGET after deaths).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { runPlayFollowerPostFanfare } from "../../src/logic/core/playCard/followerResume.js";

describe("followerResume null-board safety", () => {
  beforeEach(() => {
    resetGameState(42);
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("tolerates null board slots when finding the played follower", () => {
    const alive = {
      uid: "alive_1",
      id: "10001110",
      name: "Indomitable Fighter",
      type: "Follower",
      attack: 1,
      defense: 1,
      owner: "first",
      zone: "board",
    } as any;

    // Mimic cleanup.ts deferred-death placeholders
    state.players.first.board = [null as any, alive, null as any];

    expect(() =>
      runPlayFollowerPostFanfare({
        player: "first",
        cardUid: "alive_1",
        chosenTierEffects: null,
        costChangedOnPlay: false,
        enteringKeywordSnapshot: {},
      }),
    ).not.toThrow();

    expect(state.players.first.board.filter(Boolean)).toHaveLength(1);
  });

  it("no-ops when the played follower left the board during fanfare", () => {
    state.players.first.board = [null as any];
    expect(() =>
      runPlayFollowerPostFanfare({
        player: "first",
        cardUid: "gone",
        chosenTierEffects: null,
        costChangedOnPlay: false,
        enteringKeywordSnapshot: {},
      }),
    ).not.toThrow();
  });
});
