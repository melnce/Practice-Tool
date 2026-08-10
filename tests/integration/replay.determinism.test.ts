/**
 * @file Seeded Fuzzing Tests for Replay Determinism
 *
 * Runs random action sequences and verifies identical replays.
 * This is the gold standard for proving determinism bugs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitialState,
  resetGameState,
  state,
} from "../../src/core/gameState.js";
import { hashGameState, ReplayStep } from "../../src/core/stateHash.js";
import { validateGameState } from "../../src/core/stateValidation.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";

describe("Seeded Fuzzing: Replay Determinism", () => {
  const FIXED_SEED = 42;

  beforeEach(() => {
    resetGameState(FIXED_SEED);
  });

  /**
   * Core determinism test: same seed MUST produce identical initial state.
   */
  it("same seed produces identical initial state hash", () => {
    const state1 = createInitialState(FIXED_SEED);
    const hash1 = hashGameState(state1);

    const state2 = createInitialState(FIXED_SEED);
    const hash2 = hashGameState(state2);

    expect(hash1).toBe(hash2);
  });

  /**
   * Different seeds produce different RNG streams → different mutations → different hashes.
   * Note: Initial state hashes are equal since RNG is internal state.
   */
  it("different seeds produce different hashes after RNG-driven mutations", () => {
    const state1 = createInitialState(1);
    state1.players.first.hp -= state1.rng.nextInt(10); // RNG-driven mutation
    const hash1 = hashGameState(state1);

    const state2 = createInitialState(2);
    state2.players.first.hp -= state2.rng.nextInt(10); // Different RNG stream
    const hash2 = hashGameState(state2);

    // Different seeds → different RNG → different mutations → different hashes
    expect(hash1).not.toBe(hash2);
  });

  /**
   * RNG stream is deterministic with same seed.
   */
  it("RNG stream is deterministic", () => {
    const state1 = createInitialState(FIXED_SEED);
    const rng1Values = [
      state1.rng.nextFloat(),
      state1.rng.nextFloat(),
      state1.rng.nextInt(100),
      state1.rng.nextInt(100),
    ];

    const state2 = createInitialState(FIXED_SEED);
    const rng2Values = [
      state2.rng.nextFloat(),
      state2.rng.nextFloat(),
      state2.rng.nextInt(100),
      state2.rng.nextInt(100),
    ];

    expect(rng1Values).toEqual(rng2Values);
  });

  /**
   * State mutation followed by hash produces consistent results.
   */
  it("state mutations produce consistent hashes", () => {
    // First run
    const s1 = createInitialState(FIXED_SEED);
    s1.players.first.hp = 15;
    s1.players.second.pp = 3;
    s1.roundCount = 5;
    const h1 = hashGameState(s1);

    // Second run - identical mutations
    const s2 = createInitialState(FIXED_SEED);
    s2.players.first.hp = 15;
    s2.players.second.pp = 3;
    s2.roundCount = 5;
    const h2 = hashGameState(s2);

    expect(h1).toBe(h2);
  });

  /**
   * Invariants hold after state creation.
   */
  it("invariants hold after initial state creation", () => {
    const s = createInitialState(FIXED_SEED);
    const result = validateGameState(s);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  /**
   * Hash changes when state changes.
   */
  it("hash changes when state changes", () => {
    const s = createInitialState(FIXED_SEED);
    const hashBefore = hashGameState(s);

    s.players.first.hp -= 5;
    const hashAfter = hashGameState(s);

    expect(hashBefore).not.toBe(hashAfter);
  });
});

describe("Seeded Fuzzing: Random Action Sequences", () => {
  /**
   * Generate N random state mutations and verify replay produces same hash.
   */
  it("random mutations with same seed produce identical final hash", () => {
    const SEED = 12345;
    const ITERATIONS = 100;

    // First run
    const s1 = createInitialState(SEED);
    for (let i = 0; i < ITERATIONS; i++) {
      // Use RNG to decide what to mutate
      const action = s1.rng.nextInt(5);
      switch (action) {
        case 0:
          s1.players.first.hp = Math.max(
            0,
            s1.players.first.hp - s1.rng.nextInt(3),
          );
          break;
        case 1:
          s1.players.second.hp = Math.max(
            0,
            s1.players.second.hp - s1.rng.nextInt(3),
          );
          break;
        case 2:
          s1.players.first.pp = s1.rng.nextInt(10);
          break;
        case 3:
          s1.players.second.pp = s1.rng.nextInt(10);
          break;
        case 4:
          s1.roundCount++;
          break;
      }
    }
    const hash1 = hashGameState(s1);

    // Second run - identical sequence because same seed
    const s2 = createInitialState(SEED);
    for (let i = 0; i < ITERATIONS; i++) {
      const action = s2.rng.nextInt(5);
      switch (action) {
        case 0:
          s2.players.first.hp = Math.max(
            0,
            s2.players.first.hp - s2.rng.nextInt(3),
          );
          break;
        case 1:
          s2.players.second.hp = Math.max(
            0,
            s2.players.second.hp - s2.rng.nextInt(3),
          );
          break;
        case 2:
          s2.players.first.pp = s2.rng.nextInt(10);
          break;
        case 3:
          s2.players.second.pp = s2.rng.nextInt(10);
          break;
        case 4:
          s2.roundCount++;
          break;
      }
    }
    const hash2 = hashGameState(s2);

    // MUST be identical
    expect(hash1).toBe(hash2);
  });
});

describe("Dispatcher Hash Logging Integration", () => {
  it("dispatcher logs hashes when replayLog is provided", () => {
    const s = createInitialState(999);
    const replayLog: any[] = [];

    // Dispatch with hash logging enabled
    dispatchAction(s, { type: "END_TURN" }, { replayLog });

    expect(replayLog.length).toBe(1);
    expect(replayLog[0].actionType).toBe("END_TURN");
    expect(typeof replayLog[0].stateHashBefore).toBe("string");
    expect(typeof replayLog[0].stateHashAfter).toBe("string");
    expect(replayLog[0].stateHashBefore).not.toBe(replayLog[0].stateHashAfter);
  });

  it("same actions with same seed produce identical replay logs", () => {
    const SEED = 888;

    // Run 1
    const s1 = createInitialState(SEED);
    const log1: any[] = [];
    dispatchAction(s1, { type: "END_TURN" }, { replayLog: log1 });

    // Run 2
    const s2 = createInitialState(SEED);
    const log2: any[] = [];
    dispatchAction(s2, { type: "END_TURN" }, { replayLog: log2 });

    // Logs should match
    expect(log1.length).toBe(log2.length);
    expect(log1[0].stateHashBefore).toBe(log2[0].stateHashBefore);
    expect(log1[0].stateHashAfter).toBe(log2[0].stateHashAfter);
  });
});
