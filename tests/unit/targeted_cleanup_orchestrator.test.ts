/**
 * Regression: targeted "stat" that kills a follower must not call cleanupDead
 * inside the handler (lifecycle guard). Deaths resolve in the orchestrator.
 * Repro: soak seed 424242 gameIndex 1 — CHOOSE_TARGET after a -defense buff.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getBoard, getGraveyard } from "../../src/core/playerHelpers.js";

describe("targeted op orchestrator cleanupDead", () => {
  beforeEach(() => {
    resetGameState(77);
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("kills a 1-def follower via targeted -defense without lifecycle-guard crash", () => {
    const victim = {
      uid: "victim_1",
      id: "10001110",
      name: "Victim",
      type: "Follower",
      attack: 1,
      defense: 1,
      owner: "second",
      zone: "board",
    } as any;
    state.players.second.board = [victim];

    state.pendingTargetEffect = {
      eff: {
        op: "stat",
        action: "give",
        attack: 0,
        defense: -1,
      } as any,
      owner: "first",
      sourceCard: null,
      resumeEffects: [],
      pool: [victim],
      targets: [],
      targetUids: [],
      poolUids: [victim.uid],
      selectCount: 1,
    };

    expect(() => resolvePendingTarget(victim.uid)).not.toThrow();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(
      getGraveyard(state, "second").some((c) => c.uid === "victim_1"),
    ).toBe(true);
    expect(state.pendingTargetEffect).toBeUndefined();
  });
});
