/**
 * Pin: mode-picker confirm at nested _runEffectsDepth survives snapshot/undo resume.
 * Card: Ilsa, Brutal Drill Sergeant (10472120) mode 2 — the gate's first finding.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { state } from "../../src/core/gameState.js";
import {
  givenGameState,
  resetUidCounter,
  whenPlayCard,
} from "../harness/builders.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  applySnapshot,
  captureSnapshot,
  collectSnapshotEphemeralViolations,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { getHP } from "../../src/core/playerHelpers.js";
import type { GameState } from "../../src/core/types/index.js";

const ILSA = "10472120";
const R10 = 10;

function snapFingerprint(snap: GameState): string {
  return JSON.stringify(snap);
}

function setupIlsaTurn() {
  givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: R10,
  })
    .withFirstHand([ILSA])
    .withFirstPP(7, 10)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

/** engineDispatch PLAY_CARD — leaves pendingModeChoice open after play commits. */
function openIlsaModePromptViaEngine(): GameState {
  let modalInvocation = 0;
  injectAdapter({
    showChoiceModal: (_opts, _cb) => {
      modalInvocation++;
      // First modal per open is fanfare pause (nested runEffects). Resync after
      // undo/snapshot restore calls showChoiceModal again at depth 0 (#315).
      if (modalInvocation === 1) {
        expect((state as any)._runEffectsDepth).toBeGreaterThan(0);
      }
    },
  });

  const cardUid = state.players.first.hand[0]!.uid;
  engineDispatch(state, {
    type: "PLAY_CARD",
    player: "first",
    cardUid,
  });

  expect(state.pendingModeChoice).toBeDefined();
  return captureSnapshot();
}

function finishIlsaMode2ViaEngine() {
  engineDispatch(state, {
    type: "CHOOSE_MODE",
    player: "first",
    indices: [1],
  });
}

beforeAll(() => {
  (globalThis as any).HEADLESS = false;
});

describe("mode picker nested depth — snapshot and undo resume (Ilsa 10472120)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    (globalThis as any).HEADLESS = false;
  });

  it("sync mode confirm runs at nested _runEffectsDepth > 0 without gate violation", () => {
    setupIlsaTurn();
    let depthAtConfirm = -1;

    injectAdapter({
      showChoiceModal: (_opts, cb) => {
        depthAtConfirm = (state as any)._runEffectsDepth ?? 0;
        expect(depthAtConfirm).toBeGreaterThan(0);
        expect(collectSnapshotEphemeralViolations()).toEqual([]);
        cb(1);
      },
    });

    whenPlayCard("first", 0);
    expect(depthAtConfirm).toBeGreaterThan(0);
    expect(getHP(state, "second")).toBe(16);
  });

  it("snapshot resume through engineDispatch matches uninterrupted CHOOSE_MODE finish", () => {
    setupIlsaTurn();
    const hp0 = getHP(state, "second");

    openIlsaModePromptViaEngine();
    finishIlsaMode2ViaEngine();
    expect(getHP(state, "second")).toBe(hp0 - 4);
    const uninterruptedHash = snapFingerprint(captureSnapshot());

    setupIlsaTurn();
    const mid = openIlsaModePromptViaEngine();
    applySnapshot(mid, { autoRender: false, resetHistory: true });
    expect(state.pendingModeChoice).toBeDefined();
    expect((state as any)._runEffectsDepth ?? 0).toBe(0);

    finishIlsaMode2ViaEngine();
    expect(getHP(state, "second")).toBe(hp0 - 4);
    expect(snapFingerprint(captureSnapshot())).toBe(uninterruptedHash);
  });

  it("undo then CHOOSE_MODE finish matches uninterrupted run", () => {
    setupIlsaTurn();
    const hp0 = getHP(state, "second");

    openIlsaModePromptViaEngine();
    finishIlsaMode2ViaEngine();
    expect(getHP(state, "second")).toBe(hp0 - 4);
    const uninterruptedHash = snapFingerprint(captureSnapshot());

    setupIlsaTurn();
    openIlsaModePromptViaEngine();
    finishIlsaMode2ViaEngine();
    expect(getHP(state, "second")).toBe(hp0 - 4);

    engineDispatch(state, { type: "UNDO" });
    expect(state.pendingModeChoice).toBeDefined();
    expect((state as any)._runEffectsDepth ?? 0).toBe(0);

    finishIlsaMode2ViaEngine();
    expect(getHP(state, "second")).toBe(hp0 - 4);
    expect(snapFingerprint(captureSnapshot())).toBe(uninterruptedHash);
  });
});
