/**
 * FUSE PlayerAction through engine and core dispatch entrypoints.
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
import { injectAdapter } from "../../src/core/adapter.js";
import { setHistoryEnabled, onHistoryEvent } from "../../src/core/history.js";
import { canFuse } from "../../src/logic/core/fuseFromHand.js";
import { getHand } from "../../src/core/playerHelpers.js";

type DispatchFn = typeof engineDispatch;

const SEPHIE = "10934110";
const FILLER = "10111310";
const FORTIFIER = "90072120";
const STRIKER = "90072110";

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

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function setupFuseHand() {
  givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
    .withFirstPP(6, 6)
    .withFirstHand([SEPHIE, FILLER, FILLER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function setupFortifierHand() {
  givenGameState({ seed: 43, activePlayer: "first", roundCount: 6 })
    .withFirstPP(6, 6)
    .withFirstHand([FORTIFIER, STRIKER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("FUSE via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    mountAdapter();
  });

  it("recipe fuse: picker, confirm, Confirm Targets undo chain", () => {
    setupFuseHand();
    const sephie = getHand(state, "first").find((c) => c.id === SEPHIE)!;
    const filler = getHand(state, "first").find((c) => c.id === FILLER)!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: sephie.uid });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.requiresConfirmation).toBe(true);

    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: filler.uid },
    });
    expect(confirmOnClick).toBeTypeOf("function");
    confirmOnClick!();

    expect(sephie.isFused).toBe(true);
    expect(getHand(state, "first").some((c) => c.uid === filler.uid)).toBe(
      false,
    );

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(getHand(state, "first").some((c) => c.uid === sephie.uid)).toBe(
      true,
    );
    expect(getHand(state, "first").some((c) => c.uid === filler.uid)).toBe(
      true,
    );
  });

  it("fortifier fuse: one Fuse undo step restores both cards in hand", () => {
    setupFortifierHand();
    const fortifier = getHand(state, "first").find((c) => c.id === FORTIFIER)!;
    const striker = getHand(state, "first").find((c) => c.id === STRIKER)!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: fortifier.uid });
    expect(state.pendingTargetEffect).toBeDefined();

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(getHand(state, "first").some((c) => c.uid === fortifier.uid)).toBe(
      true,
    );
    expect(getHand(state, "first").some((c) => c.uid === striker.uid)).toBe(
      true,
    );
  });
});

describe("canFuse", () => {
  beforeEach(() => {
    resetUidCounter();
    mountAdapter();
    setupFuseHand();
  });

  it("false when no valid partner", () => {
    const sephie = getHand(state, "first").find((c) => c.id === SEPHIE)!;
    state.players.first.hand = [sephie];
    expect(canFuse("first", sephie.uid)).toBe(false);
  });

  it("false when not the active player's turn", () => {
    const sephie = getHand(state, "first").find((c) => c.id === SEPHIE)!;
    state.activePlayer = "second";
    expect(canFuse("first", sephie.uid)).toBe(false);
  });
});
