/**
 * @vitest-environment jsdom
 *
 * History Snapshot & Undo/Redo Determinism Tests
 *
 * Verifies:
 * 1. Internal caches (_triggerCache) are excluded from snapshots
 * 2. RNG state is properly saved and restored
 * 3. Undo/redo produces deterministic results
 * 4. Undo/redo reliability (evolve, attack, pending target, open-action, end-turn throw)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  beginAction,
  commitAction,
  abortAction,
  canUndo,
  canRedo,
  undo,
  redo,
  doAction,
  isInAction,
  setHistoryEnabled,
  resetHistory,
  initHistoryHotkeys,
  INTERNAL_CACHE_KEYS,
} from "../../src/core/history.js";
import { getAllZoneCandidates } from "../../src/logic/core/triggers/utils.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { endTurnBlue } from "../../src/logic/core/turns.js";
import * as cleanupMod from "../../src/logic/core/cleanup.js";
import { enableCardEvoDrop, invokeDropOnElement } from "../../src/ui/drag.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";

// Mock window for card database
if (typeof window === "undefined") {
  (global as any).window = {};
}

describe("Snapshot Omission", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    resetGameState(42);
  });

  it("should not include _triggerCache in history snapshots", () => {
    // Force trigger cache initialization
    getAllZoneCandidates();

    // Verify cache exists on state
    expect((state as any)._triggerCache).toBeDefined();
    expect((state as any)._triggerCache).not.toBeNull();

    // Take a snapshot by doing an action
    const initialHP = state.players.first.hp;
    beginAction("test_damage");
    state.players.first.hp -= 5;
    commitAction({ autoRender: false });

    // Verify action was recorded
    expect(canUndo()).toBe(true);

    // Undo to restore snapshot
    undo({ autoRender: false });

    // HP should be restored
    expect(state.players.first.hp).toBe(initialHP);

    // Trigger system should still work after restore
    const candidates = getAllZoneCandidates();
    expect(Array.isArray(candidates)).toBe(true);
  });

  it("should fail if new underscore keys appear that arent in INTERNAL_CACHE_KEYS", () => {
    // This test ensures developers add new cache keys to INTERNAL_CACHE_KEYS
    const stateKeys = Object.keys(state);

    // Special keys that are allowed (not internal caches):
    // - __debugId: Debug identity for the state instance
    // __rng must NOT leak onto the live state root after restore (H4)
    // _resolutionQueue: unified reactive-trigger + death batch (included in snapshots)
    const ALLOWED_UNDERSCORE_KEYS = new Set(["__debugId", "_resolutionQueue"]);

    const unexpectedUnderscoreKeys = stateKeys.filter(
      (k) =>
        k.startsWith("_") &&
        !INTERNAL_CACHE_KEYS.has(k) &&
        !ALLOWED_UNDERSCORE_KEYS.has(k),
    );

    expect(unexpectedUnderscoreKeys).toEqual([]);
  });

  it("should not leave __rng on the live state root after undo (H4)", () => {
    beginAction("checkpoint");
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    undo({ autoRender: false });

    expect(Object.prototype.hasOwnProperty.call(state, "__rng")).toBe(false);
    expect((state as any).__rng).toBeUndefined();
  });

  it("should include RNG state in snapshots", () => {
    // Generate some UIDs to advance RNG state
    const uid1 = state.rng.makeUid("test_");
    const uid2 = state.rng.makeUid("test_");

    // Record RNG state before action
    const rngStateBefore = state.rng.snapshot();

    // Take a snapshot
    beginAction("test_rng");
    const uid3 = state.rng.makeUid("test_");
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    // RNG state should have advanced
    const rngStateAfter = state.rng.snapshot();
    expect(rngStateAfter.uidCounter).toBeGreaterThan(rngStateBefore.uidCounter);

    // Undo should restore RNG state
    undo({ autoRender: false });

    const rngStateRestored = state.rng.snapshot();
    expect(rngStateRestored.seed).toBe(rngStateBefore.seed);
    expect(rngStateRestored.cursor).toBe(rngStateBefore.cursor);
    expect(rngStateRestored.uidCounter).toBe(rngStateBefore.uidCounter);
  });
});

describe("Undo/Redo Determinism", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    resetGameState(42);
  });

  it("should produce identical RNG outcomes after undo", () => {
    // Generate UIDs and record them
    const uidsFirstRun: string[] = [];
    const randomsFirstRun: number[] = [];

    for (let i = 0; i < 10; i++) {
      uidsFirstRun.push(state.rng.makeUid("test_"));
      randomsFirstRun.push(state.rng.nextFloat());
    }

    // Snapshot current state
    beginAction("checkpoint");
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    // Continue generating
    const uidsAfterCheckpoint: string[] = [];
    const randomsAfterCheckpoint: number[] = [];
    for (let i = 0; i < 5; i++) {
      uidsAfterCheckpoint.push(state.rng.makeUid("test_"));
      randomsAfterCheckpoint.push(state.rng.nextFloat());
    }

    // Undo to checkpoint
    undo({ autoRender: false });

    // Re-run same operations - should produce IDENTICAL results
    const uidsSecondRun: string[] = [];
    const randomsSecondRun: number[] = [];
    for (let i = 0; i < 5; i++) {
      uidsSecondRun.push(state.rng.makeUid("test_"));
      randomsSecondRun.push(state.rng.nextFloat());
    }

    // UIDs and randoms should match exactly
    expect(uidsSecondRun).toEqual(uidsAfterCheckpoint);
    expect(randomsSecondRun).toEqual(randomsAfterCheckpoint);
  });

  it("should produce identical shuffle results after undo", () => {
    const testArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // First shuffle
    const shuffle1 = state.rng.shuffle(testArray);

    // Snapshot
    beginAction("shuffle_checkpoint");
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    // Second shuffle (after checkpoint)
    const shuffle2 = state.rng.shuffle(testArray);

    // Undo
    undo({ autoRender: false });

    // Re-shuffle - should produce identical result to shuffle2
    const shuffle3 = state.rng.shuffle(testArray);

    expect(shuffle3).toEqual(shuffle2);
    expect(shuffle3).not.toEqual(shuffle1); // Different from first shuffle
  });

  it("should restore meta counters (actionSeq, zoneVersion) on undo", () => {
    // Record initial meta state
    const initialActionSeq = (state as any).actionSeq ?? 0;
    const initialZoneVersion = (state as any).zoneVersion ?? 0;

    // Perform actions that increment counters
    beginAction("action1");
    (state as any).zoneVersion = (initialZoneVersion || 0) + 1;
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    // actionSeq bumps on commit; zoneVersion only when zones change
    expect((state as any).actionSeq).toBe((initialActionSeq || 0) + 1);
    expect((state as any).zoneVersion).toBe((initialZoneVersion || 0) + 1);

    // Undo
    undo({ autoRender: false });

    // Meta counters should be restored
    expect((state as any).actionSeq).toBe(initialActionSeq);
    expect((state as any).zoneVersion).toBe(initialZoneVersion);
  });

  it("should allow redo and produce same state", () => {
    // Initial state
    const initialHP = state.players.first.hp;
    const initialRng = state.rng.snapshot();

    // Do an action
    beginAction("damageAction");
    state.players.first.hp -= 5;
    state.rng.makeUid("during_action"); // Advance RNG
    commitAction({ autoRender: false });

    // Record state after action
    const afterActionHP = state.players.first.hp;
    const afterActionRng = state.rng.snapshot();

    // Undo
    undo({ autoRender: false });
    expect(state.players.first.hp).toBe(initialHP);
    expect(state.rng.snapshot()).toEqual(initialRng);

    // Redo
    redo({ autoRender: false });
    expect(state.players.first.hp).toBe(afterActionHP);
    expect(state.rng.snapshot()).toEqual(afterActionRng);
  });

  it("should maintain determinism across multiple undo/redo cycles", () => {
    const traces: string[] = [];

    // Generate initial trace
    for (let i = 0; i < 5; i++) {
      traces.push(
        `uid:${state.rng.makeUid()},rand:${state.rng.nextFloat().toFixed(8)}`,
      );
    }

    // Checkpoint
    beginAction("multi_cycle_checkpoint");
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    // Generate more
    const postCheckpointTraces: string[] = [];
    for (let i = 0; i < 5; i++) {
      postCheckpointTraces.push(
        `uid:${state.rng.makeUid()},rand:${state.rng.nextFloat().toFixed(8)}`,
      );
    }

    // Multiple undo/redo cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      undo({ autoRender: false });

      // Re-generate - should match postCheckpointTraces
      const replayedTraces: string[] = [];
      for (let i = 0; i < 5; i++) {
        replayedTraces.push(
          `uid:${state.rng.makeUid()},rand:${state.rng.nextFloat().toFixed(8)}`,
        );
      }
      expect(replayedTraces).toEqual(postCheckpointTraces);

      // If we have redo history, redo
      if (cycle < 2) {
        redo({ autoRender: false });
      }
    }
  });
});

describe("Undo/Redo Reliability", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    resetUidCounter();
    resetHistory();
    (globalThis as any).HEADLESS = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (isInAction()) abortAction({ autoRender: false });
    resetHistory();
  });

  it("undo/redo after evolve via UI drop restores evolved state (H1)", async () => {
    // Reproduces drag.ts enableCardEvoDrop: doAction must not wrap a dynamic import.
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 5 })
      .withFirstBoard([
        {
          name: "Evo Target",
          type: "Follower",
          attack: 2,
          defense: 2,
          hasEvolved: false,
        },
      ])
      .withFirstEvo(2)
      .build();

    const card = state.players.first.board[0]!;
    const atkBefore = Number(card.attack);
    const div = document.createElement("div");
    enableCardEvoDrop(div, "blueBoard", card, state, () => {});

    const dropped = invokeDropOnElement(div, "NormalEvo");
    expect(dropped).toBe(true);

    await vi.waitFor(() => {
      expect(state.players.first.board[0]?.hasEvolved).toBe(true);
    });

    expect(Number(state.players.first.board[0]!.attack)).toBe(atkBefore + 2);

    undo({ autoRender: false });
    expect(state.players.first.board[0]?.hasEvolved).toBeFalsy();
    expect(Number(state.players.first.board[0]!.attack)).toBe(atkBefore);

    const redid = redo({ autoRender: false });
    expect(redid).toBe(true);
    // H1: redo must re-apply the evolve that was committed as the action's after-state
    expect(state.players.first.board[0]?.hasEvolved).toBe(true);
    expect(Number(state.players.first.board[0]!.attack)).toBe(atkBefore + 2);
  });

  it("undo/redo after attack follower round-trips board damage", () => {
    givenGameState({ seed: 7, activePlayer: "first" })
      .withFirstBoard([
        {
          name: "Attacker",
          type: "Follower",
          attack: 3,
          defense: 4,
          can_attack: true,
          hasAttacked: false,
          justPlayed: false,
          attacks_left: 1,
        },
      ])
      .withSecondBoard([
        {
          name: "Defender",
          type: "Follower",
          attack: 1,
          defense: 5,
          peak_defense: 5,
        },
      ])
      .build();

    const defBefore = Number(state.players.second.board[0]!.defense);
    attackFollower(0, 0, "first", "second");
    expect(Number(state.players.second.board[0]!.defense)).toBe(defBefore - 3);
    expect(canUndo()).toBe(true);

    undo({ autoRender: false });
    expect(Number(state.players.second.board[0]!.defense)).toBe(defBefore);
    expect(state.players.first.board[0]!.hasAttacked).toBeFalsy();

    redo({ autoRender: false });
    expect(Number(state.players.second.board[0]!.defense)).toBe(defBefore - 3);
  });

  it("undo while a pending-target prompt is open restores pre-prompt state", () => {
    givenGameState({ seed: 3, activePlayer: "first" })
      .withFirstPP(5, 5)
      .build();

    const initialPP = state.players.first.pp;
    doAction(
      "Play Card",
      () => {
        state.players.first.pp -= 2;
        setPendingTarget({
          eff: { op: "damage", amount: 1 },
          owner: "first",
          selectCount: 1,
          targetUids: [],
        } as any);
      },
      {},
      { autoRender: false },
    );

    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.players.first.pp).toBe(initialPP - 2);

    undo({ autoRender: false });
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(state.players.first.pp).toBe(initialPP);
  });

  it("redo round-trips multiple committed actions", () => {
    resetGameState(11);
    setHistoryEnabled(true);
    resetHistory();

    const base = state.players.first.hp;
    doAction(
      "dmg1",
      () => {
        state.players.first.hp -= 1;
      },
      {},
      { autoRender: false },
    );
    doAction(
      "dmg2",
      () => {
        state.players.first.hp -= 2;
      },
      {},
      { autoRender: false },
    );
    expect(state.players.first.hp).toBe(base - 3);

    undo({ autoRender: false });
    undo({ autoRender: false });
    expect(state.players.first.hp).toBe(base);

    redo({ autoRender: false });
    expect(state.players.first.hp).toBe(base - 1);
    redo({ autoRender: false });
    expect(state.players.first.hp).toBe(base - 3);
  });

  it("undo/redo return false while an action is open (H3)", () => {
    resetGameState(99);
    setHistoryEnabled(true);
    resetHistory();

    doAction(
      "baseline",
      () => {
        state.players.first.hp -= 1;
      },
      {},
      { autoRender: false },
    );

    beginAction("open");
    expect(isInAction()).toBe(true);

    const hpDuring = state.players.first.hp;
    expect(undo({ autoRender: false })).toBe(false);
    expect(redo({ autoRender: false })).toBe(false);
    expect(isInAction()).toBe(true);
    expect(state.players.first.hp).toBe(hpDuring);

    abortAction({ autoRender: false });
  });

  it("beginAction recovers instead of throwing when another action is open (H3)", () => {
    resetGameState(5);
    setHistoryEnabled(true);
    resetHistory();

    beginAction("stuck");
    state.players.first.hp -= 3;
    expect(isInAction()).toBe(true);

    expect(() => beginAction("recovery")).not.toThrow();
    expect(isInAction()).toBe(true);
    // Prior mutations aborted back to baseline
    expect(state.players.first.hp).toBe(20);

    state.players.first.hp -= 1;
    commitAction({ autoRender: false });
    expect(canUndo()).toBe(true);
  });

  it("recovers after a throw inside end-turn so later actions work (H2)", () => {
    givenGameState({ seed: 21, activePlayer: "first", roundCount: 2 })
      .withFirstDeck([{ name: "Draw Filler", type: "Follower", cost: 1 }])
      .withSecondDeck([{ name: "Draw Filler", type: "Follower", cost: 1 }])
      .build();

    const spy = vi
      .spyOn(cleanupMod, "cleanupDead")
      .mockImplementationOnce(() => {
        throw new Error("simulated end-turn failure");
      });

    endTurnBlue();
    spy.mockRestore();

    expect(isInAction()).toBe(false);
    expect(() => {
      doAction(
        "after_crash",
        () => {
          state.players.first.hp -= 1;
        },
        {},
        { autoRender: false },
      );
    }).not.toThrow();
    expect(canUndo()).toBe(true);
  });

  it("hotkeys ignore Ctrl+Z when focus is in an input (H5)", () => {
    resetGameState(1);
    setHistoryEnabled(true);
    resetHistory();
    doAction(
      "move",
      () => {
        state.players.first.hp -= 1;
      },
      {},
      { autoRender: false },
    );
    expect(canUndo()).toBe(true);

    const input = document.createElement("input");
    document.body.appendChild(input);

    initHistoryHotkeys({ target: document });
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);

    document.body.removeChild(input);
  });

  it("synchronous evolve via doAction still undoes cleanly", () => {
    givenGameState({ seed: 8, activePlayer: "first", roundCount: 5 })
      .withFirstBoard([
        {
          name: "Sync Evo",
          type: "Follower",
          attack: 1,
          defense: 1,
          hasEvolved: false,
        },
      ])
      .withFirstEvo(1)
      .build();

    const beforeAtk = Number(state.players.first.board[0]!.attack);
    doAction(
      "Evolve",
      () => {
        handleEvolveSelf(state.players.first.board[0]!, "first", {
          mode: "normal",
          spendPoint: true,
          runEvoEffects: true,
        });
      },
      {},
      { autoRender: false },
    );

    expect(state.players.first.board[0]!.hasEvolved).toBe(true);
    undo({ autoRender: false });
    expect(state.players.first.board[0]!.hasEvolved).toBeFalsy();
    redo({ autoRender: false });
    expect(state.players.first.board[0]!.hasEvolved).toBe(true);
    expect(Number(state.players.first.board[0]!.attack)).toBe(beforeAtk + 2);
  });
});
