/**
 * Golden Invariant: Targeting Pool Ordering
 *
 * Asserts that pools like selected:*, last_summoned, and board pools
 * maintain deterministic ordering (board left-to-right).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { getPool } from "../../src/logic/core/targeting";
import { CardInstance } from "../../src/core/types";

function makeCard(id: string, name: string): CardInstance {
  return {
    uid: id,
    name,
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
  } as CardInstance;
}

describe("Golden: Targeting Pool Ordering", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  it("ally:follower returns board order (left to right)", () => {
    const c1 = makeCard("a", "First");
    const c2 = makeCard("b", "Second");
    const c3 = makeCard("c", "Third");
    state.players.first.board = [c1, c2, c3];

    const pool = getPool("ally:follower", "first");

    expect(pool.map((c) => c.uid)).toEqual(["a", "b", "c"]);
  });

  it("enemy:follower returns opponent board order", () => {
    const c1 = makeCard("x", "EnemyFirst");
    const c2 = makeCard("y", "EnemySecond");
    state.players.second.board = [c1, c2];

    const pool = getPool("enemy:follower", "first");

    expect(pool.map((c) => c.uid)).toEqual(["x", "y"]);
  });

  it("last_summoned returns state.lastSummoned in order", () => {
    const c1 = makeCard("s1", "Summoned1");
    const c2 = makeCard("s2", "Summoned2");
    state.lastSummoned = [c1, c2];
    state.players.first.board = [c1, c2];

    const pool = getPool("last_summoned", "first");

    expect(pool.map((c) => c.uid)).toEqual(["s1", "s2"]);
  });

  it("all:follower returns blue then red boards in order", () => {
    const b1 = makeCard("b1", "Blue1");
    const b2 = makeCard("b2", "Blue2");
    const r1 = makeCard("r1", "Red1");

    state.players.first.board = [b1, b2];
    state.players.second.board = [r1];

    const pool = getPool("all:follower", "first");

    // Blue board first, then red board
    expect(pool.map((c) => c.uid)).toEqual(["b1", "b2", "r1"]);
  });
});






