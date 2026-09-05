/**
 * Mulligan toggle/confirm are undoable history steps (engine + core dispatch).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { state } from "../../src/core/gameState.js";
import { startNewGame, dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import {
  canUndo,
  canRedo,
  captureSnapshot,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { canonicalJson } from "../../src/bench/soakEnv.js";
import { getHand } from "../../src/core/playerHelpers.js";

type DispatchFn = typeof engineDispatch;

function selectableUids(player: "first" | "second"): string[] {
  return getHand(state, player)
    .filter((c) => (c as any).__mulliganSelectable)
    .map((c) => c.uid);
}

function toggle(
  dispatch: DispatchFn,
  player: "first" | "second",
  cardUid: string,
) {
  dispatch(state, { type: "TOGGLE_MULLIGAN", player, cardUid });
}

function confirm(dispatch: DispatchFn, player: "first" | "second") {
  dispatch(state, { type: "CONFIRM_MULLIGAN", player });
}

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function redo(dispatch: DispatchFn) {
  dispatch(state, { type: "REDO" });
}

function completeMulligan(dispatch: DispatchFn) {
  confirm(dispatch, "first");
  confirm(dispatch, "second");
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("mulligan undo via %s", (_label, dispatch) => {
  beforeEach(async () => {
    setHistoryEnabled(true);
    await startNewGame({
      deckAId: "aggro_abysscraft",
      deckBId: "spell_runecraft",
      seed: 20260908,
    });
    expect(state.phase).toBe("mulligan");
    expect(state.mulliganStage).toBe("first");
  });

  it("toggle two cards → undo reverts second toggle; redo re-applies; canUndo after first toggle", () => {
    const [a, b] = selectableUids("first");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    toggle(dispatch, "first", a!);
    expect(canUndo()).toBe(true);
    expect(state.mulliganFirstSelected?.has(a!)).toBe(true);

    toggle(dispatch, "first", b!);
    expect(state.mulliganFirstSelected?.has(a!)).toBe(true);
    expect(state.mulliganFirstSelected?.has(b!)).toBe(true);

    undo(dispatch);
    expect(state.mulliganFirstSelected?.has(b!)).toBe(false);
    expect(state.mulliganFirstSelected?.has(a!)).toBe(true);
    expect(canUndo()).toBe(true);

    redo(dispatch);
    expect(state.mulliganFirstSelected?.has(b!)).toBe(true);
    expect(canUndo()).toBe(true);
  });

  it("first player confirm → undo → mulligan with picks; redo → identical hand/deck", () => {
    const [a, b] = selectableUids("first");
    toggle(dispatch, "first", a!);
    toggle(dispatch, "first", b!);

    confirm(dispatch, "first");
    expect(state.mulliganStage).toBe("second");
    const afterConfirm = canonicalJson(captureSnapshot());

    undo(dispatch);
    expect(state.phase).toBe("mulligan");
    expect(state.mulliganStage).toBe("first");
    expect(state.mulliganFirstSelected?.has(a!)).toBe(true);
    expect(state.mulliganFirstSelected?.has(b!)).toBe(true);

    redo(dispatch);
    expect(canonicalJson(captureSnapshot())).toBe(afterConfirm);
    expect(state.mulliganStage).toBe("second");
  });

  it("second player confirm → undo → second mulligan; first confirm still done; redo restores game", () => {
    confirm(dispatch, "first");
    const [c] = selectableUids("second");
    toggle(dispatch, "second", c!);

    confirm(dispatch, "second");
    expect(state.phase).toBe("main");
    expect(state.turnNumber).toBe(1);
    expect(getHand(state, "first").length).toBe(5);
    const afterGame = canonicalJson(captureSnapshot());

    undo(dispatch);
    expect(state.phase).toBe("mulligan");
    expect(state.mulliganStage).toBe("second");
    expect(state.mulliganSecondSelected?.has(c!)).toBe(true);

    redo(dispatch);
    expect(canonicalJson(captureSnapshot())).toBe(afterGame);
    expect(state.phase).toBe("main");
    expect(state.turnNumber).toBe(1);
  });

  it("full history: play on turn 1, undo twice → back in mulligan", () => {
    completeMulligan(dispatch);
    expect(state.phase).toBe("main");
    expect(state.turnNumber).toBe(1);

    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
    const cheap = getHand(state, "first").find((c) => (c.cost ?? 99) <= 10);
    expect(cheap).toBeTruthy();

    dispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: cheap!.uid,
    });
    expect(canUndo()).toBe(true);

    undo(dispatch);
    expect(state.phase).toBe("main");
    expect(getHand(state, "first").length).toBe(5);

    undo(dispatch);
    expect(state.phase).toBe("mulligan");
    expect(state.mulliganStage).toBe("second");
  });
});
