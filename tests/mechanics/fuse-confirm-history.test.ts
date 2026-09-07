/**
 * Fuse confirmation survives history: picks are committed; confirm is reconstructible
 * from serializable pending data (not a stored function). CONFIRM_TARGETS works after
 * undo, save/load, and re-execution.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { injectAdapter } from "../../src/core/adapter.js";
import {
  applySnapshot,
  captureSnapshot,
  setHistoryEnabled,
  resetHistory,
} from "../../src/core/history.js";
import {
  canConfirmPendingTarget,
  getPendingConfirmKey,
} from "../../src/logic/core/pendingTarget/confirmRegistry.js";
import { getHand, getBoard } from "../../src/core/playerHelpers.js";
import { installSoakAdapter, runSoakGame } from "../../src/bench/soakEnv.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";

const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const SEPHIE = "10934110";
const OTS = "10931110";
const FILLER_A = "10111310";
const FILLER_B = "10102110";
const ECSTATIC_SCHOLAR = "10933110";
const WILLS_UNITED = "10803310";

type DispatchFn = typeof engineDispatch;

function mountAdapter() {
  injectAdapter({
    render: () => {},
    showChoiceModal: () => {},
    showTargetConfirmationButton: () => {},
    hideTargetConfirmation: () => {},
    triggerConfirmButtonClick: () => {},
  });
}

function chooseTarget(dispatch: DispatchFn, uid: string) {
  dispatch(state, {
    type: "CHOOSE_TARGET",
    player: state.pendingTargetEffect?.owner ?? "first",
    target: { type: "card", uid },
  });
}

function confirmTargets(dispatch: DispatchFn) {
  dispatch(state, { type: "CONFIRM_TARGETS" });
}

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function redo(dispatch: DispatchFn) {
  dispatch(state, { type: "REDO" });
}

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("fuse confirm history via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    mountAdapter();
  });

  it("(a) gear_multi: pick, confirm, undo, CONFIRM_TARGETS matches uninterrupted run", () => {
    givenGameState({ seed: 10, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([GEAR_AMBITION, GEAR_REMEMBRANCE])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ambition = getHand(state, "first").find(
      (c) => c.id === GEAR_AMBITION,
    )!;
    const remembrance = getHand(state, "first").find(
      (c) => c.id === GEAR_REMEMBRANCE,
    )!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: ambition.uid });
    expect(state.pendingTargetEffect?.picksAreCommitted).toBe(true);
    expect(getPendingConfirmKey(state.pendingTargetEffect!)).toBe(
      "fuse:finalize:gear_multi",
    );

    chooseTarget(dispatch, remembrance.uid);
    const midPrompt = captureSnapshot();

    confirmTargets(dispatch);
    const snapDone = captureSnapshot();
    expect(state.lastFuse?.result_name).toBe("Striker Artifact");
    expect(state.pendingTargetEffect).toBeUndefined();

    undo(dispatch);
    expect(state.pendingTargetEffect?.targetUids).toEqual([remembrance.uid]);
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);

    confirmTargets(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);

    undo(dispatch);
    undo(dispatch);
    redo(dispatch);
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);
    confirmTargets(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);

    applySnapshot(midPrompt, { autoRender: false });
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);
    expect(state.pendingTargetEffect?.eff).toMatchObject({
      op: "fuse",
      action: "finalize",
      type: "gear_multi",
    });
    confirmTargets(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);
  });

  it("(b) cards fuse: two legal partners — recorded partner survives restore", () => {
    givenGameState({ seed: 11, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([SEPHIE, OTS, FILLER_A])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const sephie = getHand(state, "first").find((c) => c.id === SEPHIE)!;
    const ots = getHand(state, "first").find((c) => c.id === OTS)!;
    const filler = getHand(state, "first").find((c) => c.id === FILLER_A)!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: sephie.uid });
    chooseTarget(dispatch, ots.uid);
    const midPrompt = captureSnapshot();

    confirmTargets(dispatch);
    const snapDone = captureSnapshot();
    expect(state.lastFuse?.partner_name).toContain("Obsessed Test Subject");

    undo(dispatch);
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);
    confirmTargets(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);

    applySnapshot(midPrompt, { autoRender: false });
    confirmTargets(dispatch);
    expect(state.lastFuse?.partner_name).toContain("Obsessed Test Subject");
    expect(getHand(state, "first").some((c) => c.uid === filler.uid)).toBe(
      true,
    );

    givenGameState({ seed: 11, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([SEPHIE, OTS, FILLER_A])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    const sephie2 = getHand(state, "first").find((c) => c.id === SEPHIE)!;
    const filler2 = getHand(state, "first").find((c) => c.id === FILLER_A)!;
    dispatch(state, { type: "FUSE", player: "first", cardUid: sephie2.uid });
    chooseTarget(dispatch, filler2.uid);
    confirmTargets(dispatch);
    expect(state.lastFuse?.partner_name).not.toContain("Obsessed Test Subject");
  });

  it("(c) Sephie on_fuse: spends 2 PP and summons OTS; undo then CONFIRM_TARGETS", () => {
    givenGameState({ seed: 12, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([SEPHIE, FILLER_B])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const sephie = getHand(state, "first").find((c) => c.id === SEPHIE)!;
    const filler = getHand(state, "first").find((c) => c.id === FILLER_B)!;
    const ppBefore = state.players.first.pp;

    dispatch(state, { type: "FUSE", player: "first", cardUid: sephie.uid });
    chooseTarget(dispatch, filler.uid);
    confirmTargets(dispatch);

    expect(sephie.isFused).toBe(true);
    expect(state.players.first.pp).toBe(ppBefore - 2);
    expect(
      getBoard(state, "first").filter((c) => c.name === "Obsessed Test Subject")
        .length,
    ).toBe(1);

    const snapDone = captureSnapshot();
    undo(dispatch);
    undo(dispatch);
    redo(dispatch);
    confirmTargets(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);
  });

  it("(d) Ecstatic Scholar cards fuse: mid-prompt snapshot → restore → confirm", () => {
    givenGameState({ seed: 13, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([ECSTATIC_SCHOLAR, WILLS_UNITED])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const scholar = getHand(state, "first").find(
      (c) => c.id === ECSTATIC_SCHOLAR,
    )!;
    const wills = getHand(state, "first").find((c) => c.id === WILLS_UNITED)!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: scholar.uid });
    chooseTarget(dispatch, wills.uid);
    const midPrompt = captureSnapshot();
    confirmTargets(dispatch);
    const snapDone = captureSnapshot();
    expect(state.lastFuse?.result_name).toBe("fused_cards");
    expect(state.lastFuse?.partner_name).toContain("Wills United");

    applySnapshot(midPrompt, { autoRender: false });
    expect(getPendingConfirmKey(state.pendingTargetEffect!)).toBe(
      "fuse:finalize:cards",
    );
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);
    confirmTargets(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);
  });
});

describe("fuse confirm history soak pins (seed 20260909)", () => {
  beforeAll(async () => {
    (globalThis as any).HEADLESS = true;
    await initCardDatabaseNode();
  });

  const PINS = [
    { gameIndex: 101, label: "gear_multi game 101", interactiveModes: true },
    {
      gameIndex: 118,
      label: "cards fuse partner game 118",
      interactiveModes: true,
    },
    {
      gameIndex: 152,
      label: "Ecstatic Scholar game 152",
      interactiveModes: true,
    },
    // Game 161 hits earth-sigil mode prompts; interactive mode re-execute is a separate finding.
    { gameIndex: 161, label: "gear_multi game 161", interactiveModes: false },
  ];

  for (const pin of PINS) {
    it(`${pin.label} — history re-execute clean`, async () => {
      installSoakAdapter({ interactiveModes: pin.interactiveModes });
      process.env.DISABLE_HISTORY = "0";
      const result = await runSoakGame({
        seed: 20260909,
        gameIndex: pin.gameIndex,
        turnCap: 60,
        actionCap: 800,
        historyCheck: true,
        historyReExecute: true,
        fuse: true,
        interactiveModes: pin.interactiveModes,
        dispatch: "engine",
      });
      expect(
        result.outcome,
        result.error ?? JSON.stringify(result, null, 2),
      ).toBe("completed");
    }, 60_000);
  }
});
