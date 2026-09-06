/**
 * Gear multi-fuse lifecycle: targeted finalize must not run orchestrator cleanup.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { onHistoryEvent, setHistoryEnabled } from "../../src/core/history.js";
import { injectAdapter } from "../../src/core/adapter.js";

const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const STRIKER_ARTIFACT = "90072110";

type DispatchFn = typeof engineDispatch;

let confirmOnClick: (() => void) | null = null;

function mountAdapter() {
  confirmOnClick = null;
  injectAdapter({
    render: () => {},
    showChoiceModal: () => {},
    showTargetConfirmationButton: (vm: { onConfirm: () => void }) => {
      confirmOnClick = vm.onConfirm;
    },
    hideTargetConfirmation: () => {
      confirmOnClick = null;
    },
    triggerConfirmButtonClick: () => {
      confirmOnClick?.();
    },
  });
}

function fuseCard(
  dispatch: DispatchFn,
  player: "first" | "second",
  cardUid: string,
) {
  dispatch(state, { type: "FUSE", player, cardUid });
}

function chooseTarget(
  dispatch: DispatchFn,
  player: "first" | "second",
  uid: string,
) {
  dispatch(state, {
    type: "CHOOSE_TARGET",
    player,
    target: { type: "card", uid },
  });
}

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function handHasSelectableFlag(): boolean {
  return state.players.first.hand.some((c) => c.__uiSelectable === true);
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("gear multi-fuse lifecycle via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    mountAdapter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([GEAR_AMBITION, GEAR_REMEMBRANCE])
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("gear_multi finalize: no guard error, Striker Artifact, clean targeting state", () => {
    const ambition = state.players.first.hand.find(
      (c) => c.name === "Gear of Ambition",
    )!;
    const remembrance = state.players.first.hand.find(
      (c) => c.name === "Gear of Remembrance",
    )!;

    fuseCard(dispatch, "first", ambition.uid);
    expect(state.pendingTargetEffect?.eff).toMatchObject({
      op: "fuse",
      action: "finalize",
      type: "gear_multi",
    });

    chooseTarget(dispatch, "first", remembrance.uid);
    expect(confirmOnClick).toBeTypeOf("function");
    confirmOnClick!();

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(handHasSelectableFlag()).toBe(false);
    expect(state.players.first.hand).toHaveLength(1);
    expect(state.players.first.hand[0]?.name).toBe("Striker Artifact");
    expect(state.players.first.hand[0]?.id).toBe(STRIKER_ARTIFACT);
  });

  it("one Confirm Targets undo step per prompt; undo reopens with no picks", () => {
    const commits: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") commits.push(ev.name);
    });

    const ambition = state.players.first.hand.find(
      (c) => c.name === "Gear of Ambition",
    )!;
    const remembrance = state.players.first.hand.find(
      (c) => c.name === "Gear of Remembrance",
    )!;

    fuseCard(dispatch, "first", ambition.uid);
    chooseTarget(dispatch, "first", remembrance.uid);
    confirmOnClick!();

    expect(commits.filter((n) => n === "Confirm Targets")).toHaveLength(1);
    expect(state.pendingTargetEffect).toBeUndefined();

    undo(dispatch);
    unsub();

    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);
    expect(state.pendingTargetEffect?.eff).toMatchObject({
      op: "fuse",
      type: "gear_multi",
    });
    expect(state.pendingTargetEffect?.pool?.map((c) => c.uid)).toEqual([
      remembrance.uid,
    ]);
  });
});
