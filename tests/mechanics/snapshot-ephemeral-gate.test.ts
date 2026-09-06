/**
 * Snapshot ephemeral gate: committed history must not carry state the snapshot layer drops.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  state,
  resetGameState,
  getKnownRootKeysForTest,
} from "../../src/core/gameState.js";
import {
  beginAction,
  commitAction,
  doAction,
  setHistoryEnabled,
  resetHistory,
  SNAPSHOT_EPHEMERAL_ALLOWLIST,
  SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT,
  SNAPSHOT_EPHEMERAL_MAY_BE_SET,
  INTERNAL_CACHE_KEYS,
  collectSnapshotEphemeralViolations,
  captureSnapshot,
} from "../../src/core/history.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { getTriggerChainDepth } from "../../src/logic/core/triggers.js";
import { isTargetedOpDispatchActive } from "../../src/logic/core/targeting/guards.js";
import { givenGameState } from "../harness/builders.js";

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("INTERNAL_CACHE_KEYS vs KNOWN_ROOT_KEYS", () => {
  it("every snapshot-ephemeral key is in KNOWN_ROOT_KEYS (lists cannot drift)", () => {
    const known = getKnownRootKeysForTest();
    for (const key of INTERNAL_CACHE_KEYS) {
      expect(known.has(key)).toBe(true);
    }
  });

  it("every INTERNAL_CACHE_KEYS entry is must_be_default or may_be_set", () => {
    for (const key of INTERNAL_CACHE_KEYS) {
      const row =
        SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT[key] ||
        SNAPSHOT_EPHEMERAL_MAY_BE_SET[key];
      expect(row?.length).toBeGreaterThan(0);
    }
  });
});

describe("snapshot ephemeral gate must_be_default at commit", () => {
  beforeEach(() => {
    resetGameState(42);
    setHistoryEnabled(true);
    resetHistory();
  });

  const scalarDefaults: Record<string, unknown> = {
    _runEffectsDepth: 0,
    sotBoundaryDeferDrain: false,
    turnBoundaryInvokePhase: false,
    __resolutionDrainDepth: 0,
    triggerChainDepth: 0,
    targetedOpDispatchActive: false,
  };

  for (const key of Object.keys(SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT)) {
    it(`must_be_default: ${key} is default after a normal commit`, () => {
      doAction(
        "baseline",
        () => {
          state.players.first.hp -= 1;
        },
        {},
        { autoRender: false },
      );
      if (key === "triggerChainDepth") {
        expect(getTriggerChainDepth()).toBe(scalarDefaults[key]);
      } else if (key === "targetedOpDispatchActive") {
        expect(isTargetedOpDispatchActive()).toBe(scalarDefaults[key]);
      } else if (INTERNAL_CACHE_KEYS.has(key)) {
        expect((state as any)[key] ?? scalarDefaults[key]).toBe(
          scalarDefaults[key],
        );
      }
    });
  }

  it("fresh commit has no snapshot ephemeral violations", () => {
    doAction(
      "hp tick",
      () => {
        state.players.first.hp -= 1;
      },
      {},
      { autoRender: false },
    );
    expect(collectSnapshotEphemeralViolations()).toEqual([]);
  });
});

describe("snapshot ephemeral gate enforcement", () => {
  beforeEach(() => {
    resetGameState(7);
    setHistoryEnabled(true);
    resetHistory();
  });

  it("throws when sotBoundaryDeferDrain is non-default at commit (must_be_default)", () => {
    beginAction("poison");
    (state as any).sotBoundaryDeferDrain = true;
    expect(() => commitAction({ autoRender: false })).toThrow(
      /sotBoundaryDeferDrain \(must_be_default\)/,
    );
  });

  it("may_be_set keys do not trip the gate when legitimately non-default", () => {
    beginAction("defer");
    (state as any).deferDeathTriggers = true;
    expect(collectSnapshotEphemeralViolations()).toEqual([]);
    commitAction({ autoRender: false });
  });

  it("paused mid-prompt commit with empty picks passes the gate", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    setPendingTarget({
      eff: { op: "damage", amount: 1 },
      owner: "first",
      selectCount: 2,
      targetUids: [],
    } as any);

    beginAction("Pick Target");
    expect(collectSnapshotEphemeralViolations()).toEqual([]);
    commitAction({ autoRender: false });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);
  });

  it("snapshot preserves targetUids when picksAreCommitted", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    setPendingTarget({
      eff: { op: "damage", amount: 1 },
      owner: "first",
      selectCount: 2,
      targetUids: ["pick_a"],
      picksAreCommitted: true,
    } as any);

    const snap = captureSnapshot();
    expect(snap.pendingTargetEffect?.targetUids).toEqual(["pick_a"]);
  });

  it("snapshot clears targetUids when picksAreCommitted is false", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    setPendingTarget({
      eff: { op: "damage", amount: 1 },
      owner: "first",
      selectCount: 2,
      targetUids: ["pick_a"],
      picksAreCommitted: false,
    } as any);

    const snap = captureSnapshot();
    expect(snap.pendingTargetEffect?.targetUids).toEqual([]);
  });

  it("snapshot preserves partialPickedIndices when picksAreCommitted", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    state.pendingModeChoice = {
      owner: "first",
      optionCount: 3,
      selectCount: 2,
      options: [{ label: "a" }, { label: "b" }, { label: "c" }],
      partialPickedIndices: [0],
      picksAreCommitted: true,
    };

    const snap = captureSnapshot();
    expect(snap.pendingModeChoice?.partialPickedIndices).toEqual([0]);
  });

  it("snapshot clears partialPickedIndices when picksAreCommitted is false", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    state.pendingModeChoice = {
      owner: "first",
      optionCount: 3,
      selectCount: 2,
      options: [{ label: "a" }, { label: "b" }, { label: "c" }],
      partialPickedIndices: [0],
      picksAreCommitted: false,
    };

    const snap = captureSnapshot();
    expect(snap.pendingModeChoice?.partialPickedIndices).toEqual([]);
  });
}, 60_000);
