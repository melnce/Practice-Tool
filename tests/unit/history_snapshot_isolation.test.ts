/**
 * History undo/redo must not share live-state references with stored snapshots.
 * Without cloning on apply, in-place mutations corrupt older history entries
 * (deep undo chains then fail while single-step round-trips still pass).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../src/core/gameState.js";
import {
  doAction,
  redo,
  setHistoryEnabled,
  undo,
} from "../../src/core/history.js";
import { givenGameState } from "../harness/builders.js";

describe("history snapshot isolation", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 1 }).build();
  });

  it("deep redo restores pre-mutation snapshots after in-place array edits", () => {
    doAction(
      "drawA",
      () => {
        state.lastDrawnCards = [{ uid: "a", name: "CardA" } as any];
      },
      {},
      { autoRender: false },
    );
    doAction(
      "drawB",
      () => {
        state.lastDrawnCards.unshift({ uid: "b", name: "CardB" } as any);
      },
      {},
      { autoRender: false },
    );

    undo({ autoRender: false });
    undo({ autoRender: false });

    redo({ autoRender: false });
    // Corrupt live state in-place (simulates later turns mutating lastDrawnCards).
    state.lastDrawnCards[0]!.name = "MUTATED";

    redo({ autoRender: false });
    undo({ autoRender: false });
    undo({ autoRender: false });

    // Oldest entry's after snapshot must still be CardA, not MUTATED.
    redo({ autoRender: false });
    expect(state.lastDrawnCards.map((c) => c.name)).toEqual(["CardA"]);
  });
});
