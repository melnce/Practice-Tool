/**
 * @vitest-environment jsdom
 *
 * Exercises playFollower → fireTrigger in a browser-like runtime where
 * the Node `process` global is absent. Catches ReferenceError bugs that
 * only appear in the browser (the main vitest suite runs in Node).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { resetGameState, state } from "../../src/core/gameState.js";
import { playFollower } from "../../src/logic/core/playCard/follower.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { isUidEnrichDisabled } from "../../src/core/env.js";

/** Drain microtasks after restoring Node globals (Vite lazy imports need process). */
async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe("browser runtime (no process global)", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  it("playFollower → fireTrigger completes without Node process", async () => {
    const savedProcess = globalThis.process;

    resetGameState(42);
    state.activePlayer = "first";
    state.phase = "main";

    const card: CardInstance = {
      uid: "browser_smoke_follower",
      name: "Goblin",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 2,
      can_attack: false,
      fanfare: [],
    };

    Reflect.deleteProperty(globalThis, "process");

    try {
      expect(globalThis.process).toBeUndefined();
      expect(isUidEnrichDisabled()).toBe(false);

      expect(() => playFollower(card, "first", null)).not.toThrow();
      expect(state.players.first.board).toHaveLength(1);
      expect(state.players.first.board[0]?.uid).toBe("browser_smoke_follower");
    } finally {
      if (savedProcess !== undefined) {
        globalThis.process = savedProcess;
      }
    }

    await flushMicrotasks();
  });
});
