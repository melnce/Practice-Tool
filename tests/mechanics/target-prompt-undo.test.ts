/**
 * Undo restores an open target prompt with no stale picks (snapshot sanitization).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { highlightSelectable } from "../../src/logic/core/targeting.js";
import { injectAdapter } from "../../src/core/adapter.js";
import {
  captureSnapshot,
  onHistoryEvent,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { getShadows } from "../../src/core/playerHelpers.js";

type DispatchFn = typeof engineDispatch;

let confirmOnClick: (() => void) | null = null;

function mountAdapter(opts?: { autoConfirm?: boolean }) {
  confirmOnClick = null;
  injectAdapter({
    render: () => {},
    showChoiceModal: () => {},
    showTargetConfirmationButton: (vm: { onConfirm: () => void }) => {
      confirmOnClick = vm.onConfirm;
      if (opts?.autoConfirm) vm.onConfirm();
    },
    hideTargetConfirmation: () => {
      confirmOnClick = null;
    },
    triggerConfirmButtonClick: () => {
      confirmOnClick?.();
    },
  });
}

function chooseTarget(dispatch: DispatchFn, uid: string) {
  dispatch(state, { type: "CHOOSE_TARGET", target: { type: "card", uid } });
}

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function redo(dispatch: DispatchFn) {
  dispatch(state, { type: "REDO" });
}

function setupTwoTargetPrompt() {
  const a = createCard("10001110", "board", "second");
  const b = createCard("10001120", "board", "second");
  a.uid = "t_a";
  b.uid = "t_b";
  a.peak_defense = Number(a.defense);
  b.peak_defense = Number(b.defense);
  state.players.second.board = [a, b];

  setPendingTarget({
    eff: { op: "damage", amount: 2, select: 2 } as any,
    owner: "first",
    sourceCard: null,
    pool: [a, b],
    poolUids: [a.uid, b.uid],
    targets: [],
    targetUids: [],
    selectCount: 2,
    requiresConfirmation: true,
  });
  highlightSelectable([a, b]);
  return { a, b };
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("target prompt snapshot sanitization", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    mountAdapter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("captureSnapshot clears pending targetUids and __uiSelectable flags", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const a = createCard("10001110", "board", "second");
    const b = createCard("10001120", "board", "second");
    a.uid = "t_a";
    b.uid = "t_b";
    a.__uiSelectable = true;
    b.__uiSelectable = true;
    state.players.second.board = [a, b];
    state.pendingTargetEffect = {
      eff: { op: "damage", amount: 1 },
      owner: "first",
      sourceCard: null,
      pool: [a, b],
      poolUids: [a.uid, b.uid],
      targetUids: [a.uid],
      selectCount: 2,
    } as any;

    const snap = captureSnapshot();
    expect(snap.pendingTargetEffect?.targetUids).toEqual([]);
    expect(a.__uiSelectable).toBe(true);
    expect(snap.players.second.board[0]?.__uiSelectable).toBeUndefined();
  });
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("target prompt undo via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    mountAdapter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    givenGameState({ seed: 5, activePlayer: "first" }).build();
  });

  it("click one target of two, undo confirm step → prompt open with empty targetUids", () => {
    const { a, b } = setupTwoTargetPrompt();
    const poolUids = [a.uid, b.uid];

    chooseTarget(dispatch, a.uid);
    expect(state.pendingTargetEffect?.targetUids).toEqual([a.uid]);

    chooseTarget(dispatch, b.uid);
    expect(confirmOnClick).toBeTypeOf("function");
    confirmOnClick!();
    expect(state.pendingTargetEffect).toBeUndefined();

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);
    expect(state.pendingTargetEffect?.pool?.map((c) => c.uid)).toEqual(
      poolUids,
    );
  });

  it("click both + confirm → undo → prompt open with no picks; redo resolves as before", () => {
    const { a, b } = setupTwoTargetPrompt();

    chooseTarget(dispatch, a.uid);
    chooseTarget(dispatch, b.uid);
    confirmOnClick!();

    expect(state.pendingTargetEffect).toBeUndefined();
    const defA = Number(a.defense);
    const defB = Number(b.defense);

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);
    expect(state.pendingTargetEffect?.pool?.map((c) => c.uid)).toEqual([
      a.uid,
      b.uid,
    ]);

    redo(dispatch);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(a.defense)).toBe(defA);
    expect(Number(b.defense)).toBe(defB);
  });

  it("confirm with summon enter reaction — queue empty at every commit; undo/redo matches", () => {
    const watcher = createCard(
      {
        name: "Enter Watcher",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        triggers: [
          {
            type: "ally_follower_enter",
            effects: [{ op: "add_shadows", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "second",
    );
    enemy.peak_defense = 1;
    state.players.first.board = [watcher];
    state.players.second.board = [enemy];

    setPendingTarget({
      eff: {
        op: "nested_effects",
        effects: [
          {
            op: "summon",
            name: "Summoned Token",
            count: 1,
            source: "named",
            type: "Follower",
            attack: 1,
            defense: 1,
          },
        ],
      } as any,
      owner: "first",
      sourceCard: watcher,
      pool: [enemy],
      poolUids: [enemy.uid],
      targets: [],
      targetUids: [],
      selectCount: 1,
      requiresConfirmation: true,
    });
    highlightSelectable([enemy]);

    const queueAtCommits: number[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") {
        queueAtCommits.push(getResolutionQueue().length);
      }
    });

    chooseTarget(dispatch, enemy.uid);
    confirmOnClick!();
    unsub();

    expect(queueAtCommits.length).toBeGreaterThan(0);
    for (const len of queueAtCommits) {
      expect(len).toBe(0);
    }
    expect(getResolutionQueue()).toHaveLength(0);

    const shadowsAfter = getShadows(state, "first");
    const boardLenAfter = state.players.first.board.length;
    const snapAfter = captureSnapshot();

    undo(dispatch);
    expect(getResolutionQueue()).toHaveLength(0);

    redo(dispatch);
    expect(getResolutionQueue()).toHaveLength(0);
    expect(getShadows(state, "first")).toBe(shadowsAfter);
    expect(state.players.first.board.length).toBe(boardLenAfter);
    expect(captureSnapshot()).toEqual(snapAfter);
  });
});
