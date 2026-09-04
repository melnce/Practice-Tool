import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import type { Effect } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

describe("Scenario: Selection Resolution", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("pauses with pendingTargetEffect when no targets are provided", () => {
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "second",
    );
    state.players.first.board = [ally];
    state.players.second.board = [enemy];

    const effect: Effect = {
      op: "damage",
      amount: 1,
      target: "enemy:follower",
      select: 1,
    };

    const result = runEffects([effect], "first", ally);

    expect(result).toBe("pending");
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.eff?.op).toBe("damage");
  });

  it("clears pendingTargetEffect after a valid selection resolves", () => {
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "second",
    );
    enemy.peak_defense = enemy.defense;
    state.players.first.board = [ally];
    state.players.second.board = [enemy];

    const effect: Effect = {
      op: "damage",
      amount: 1,
      target: "enemy:follower",
      select: 1,
    };

    expect(runEffects([effect], "first", ally)).toBe("pending");
    expect(state.pendingTargetEffect).toBeDefined();

    resolvePendingTarget(String(enemy.uid));

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(enemy.defense)).toBe(0);
  });
});
