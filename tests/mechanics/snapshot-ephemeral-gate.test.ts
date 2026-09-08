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
  SNAPSHOT_EPHEMERAL_MUST_BE_DEFAULT,
  SNAPSHOT_EPHEMERAL_MAY_BE_SET,
  SNAPSHOT_DROPPED_STATE_AUDIT,
  SNAPSHOT_DROPPED_FUNCTION_ALLOWLIST,
  INTERNAL_CACHE_KEYS,
  collectSnapshotEphemeralViolations,
  collectSnapshotDroppedFunctionViolations,
  captureSnapshot,
} from "../../src/core/history.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  canConfirmPendingTarget,
  getPendingConfirmKey,
} from "../../src/logic/core/pendingTarget/confirmRegistry.js";
import { injectAdapter } from "../../src/core/adapter.js";
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

describe("SNAPSHOT_DROPPED_STATE_AUDIT", () => {
  it("functions row documents #315 confirmHook removal and absolute gate", () => {
    const row = SNAPSHOT_DROPPED_STATE_AUDIT.find((r) =>
      r.category.startsWith("Functions / non-cloneable"),
    );
    expect(row?.proofClass).toBe("b");
    expect(row?.proof).toContain("confirmHook");
    expect(row?.proof).toContain("#315");
    expect(row?.proof).toContain("confirmRegistry");
  });
});

describe("snapshot dropped function gate", () => {
  beforeEach(() => {
    resetGameState(11);
    setHistoryEnabled(true);
    resetHistory();
    injectAdapter({
      render: () => {},
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
    });
  });

  it("allowlist is empty after #315 — gate is absolute, not allowlisted", () => {
    expect(Object.keys(SNAPSHOT_DROPPED_FUNCTION_ALLOWLIST)).toEqual([]);
  });

  it("throws when any function is reachable from pendingTargetEffect", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    setPendingTarget({
      eff: { op: "damage", amount: 1 },
      owner: "first",
      selectCount: 1,
      targetUids: [],
    } as any);
    (state.pendingTargetEffect as any).mysteryHook = () => {};

    expect(() => captureSnapshot()).toThrow(
      /snapshot dropped gameplay function.*pendingTargetEffect\.mysteryHook/,
    );
  });

  it("fuse confirm_needed pending carries confirmKey, not a function (#315)", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand(["10934110", "10111310", "10111310"])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const filler = state.players.first.hand.find((c) => c.id === "10111310")!;
    setPendingTarget({
      eff: { op: "fuse", action: "recipe" },
      owner: "first",
      sourceCard: state.players.first.hand.find((c) => c.id === "10934110")!,
      selectCount: 1,
      targetUids: [],
      requiresConfirmation: true,
      pool: state.players.first.hand,
    } as any);

    resolvePendingTarget(filler.uid);
    expect(getPendingConfirmKey(state.pendingTargetEffect!)).toBe(
      "targeted:fuse",
    );
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);
    expect(
      collectSnapshotDroppedFunctionViolations(state, captureSnapshot()),
    ).toEqual([]);
    expect(() => captureSnapshot()).not.toThrow();
  });
});

describe("snapshot ephemeral gate must_be_default at commit", () => {
  beforeEach(() => {
    resetGameState(42);
    setHistoryEnabled(true);
    resetHistory();
  });

  const scalarDefaults: Record<string, unknown> = {
    sotBoundaryDeferDrain: false,
    turnBoundaryInvokePhase: false,
    __resolutionDrainDepth: 0,
    triggerChainDepth: 0,
    targetedOpDispatchActive: false,
    playSequenceDepth: 0,
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

  it("throws when playSequenceDepth > 0 at commit without pause", () => {
    beginAction("leak");
    (state as any).playSequenceDepth = 2;
    expect(() => commitAction({ autoRender: false })).toThrow(
      /playSequenceDepth=2/,
    );
  });

  it("playSequenceDepth > 0 is allowed at commit when isEffectResolutionPaused()", () => {
    beginAction("paused play");
    (state as any).playSequenceDepth = 1;
    state.pendingModeChoice = {
      owner: "first",
      optionCount: 2,
      selectCount: 1,
      options: [{ label: "a" }, { label: "b" }],
      partialPickedIndices: [],
    };
    expect(collectSnapshotEphemeralViolations()).toEqual([]);
    commitAction({ autoRender: false });
  });

  it("may_be_set: deferDeathTriggers does not trip the gate when legitimately true", () => {
    beginAction("defer");
    (state as any).deferDeathTriggers = true;
    expect(collectSnapshotEphemeralViolations()).toEqual([]);
    commitAction({ autoRender: false });
  });

  it("may_be_set: _runEffectsDepth does not trip the gate when nested mode confirm commits", () => {
    beginAction("nested");
    (state as any)._runEffectsDepth = 2;
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
