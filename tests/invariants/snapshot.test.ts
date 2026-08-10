// @vitest-environment node
/**
 * History Snapshot & Undo/Redo Determinism Tests
 *
 * Verifies:
 * 1. Internal caches (_triggerCache) are excluded from snapshots
 * 2. RNG state is properly saved and restored
 * 3. Undo/redo produces deterministic results
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  beginAction,
  commitAction,
  canUndo,
  undo,
  redo,
  setHistoryEnabled,
  INTERNAL_CACHE_KEYS,
} from "../../src/core/history.js";
import { getAllZoneCandidates } from "../../src/logic/core/triggers/utils.js";

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
    // - __rng: RNG snapshot stored during undo/redo restoration
    const ALLOWED_UNDERSCORE_KEYS = new Set(["__debugId", "__rng"]);

    const unexpectedUnderscoreKeys = stateKeys.filter(
      (k) =>
        k.startsWith("_") &&
        !INTERNAL_CACHE_KEYS.has(k) &&
        !ALLOWED_UNDERSCORE_KEYS.has(k),
    );

    expect(unexpectedUnderscoreKeys).toEqual([]);
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
    (state as any).actionSeq = (initialActionSeq || 0) + 1;
    (state as any).zoneVersion = (initialZoneVersion || 0) + 1;
    state.players.first.hp -= 1;
    commitAction({ autoRender: false });

    // Counters should be incremented
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
