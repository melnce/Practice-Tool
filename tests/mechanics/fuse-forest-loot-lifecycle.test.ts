/**
 * Forest (Garden's Allure) and Loot (Returning Slash) fuse finalizes must not
 * call lifecycle cleanup inside targeted handlers — orchestrator owns that.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import { getHand, getBanish } from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";

type DispatchFn = typeof engineDispatch;

const GARDENS_ALLURE = "10213310";
const FOREST_PARTNER = "10111310";
const RETURNING_SLASH = "10323310";
const CONGREGANT = "10323110";

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

function flaggedAnywhere(): Array<{ uid: string; zone: string }> {
  const hits: Array<{ uid: string; zone: string }> = [];
  for (const player of ["first", "second"] as const) {
    const zones = [
      ["board", state.players[player].board],
      ["hand", state.players[player].hand],
      ["deck", state.players[player].deck],
      ["graveyard", state.players[player].graveyard],
      ["banish", state.players[player].banish],
    ] as const;
    for (const [zone, cards] of zones) {
      for (const c of cards) {
        if (c?.__uiSelectable) hits.push({ uid: c.uid, zone });
      }
    }
  }
  return hits;
}

function setupGardensAllureHand() {
  givenGameState({ seed: 44, activePlayer: "first", roundCount: 6 })
    .withFirstPP(6, 6)
    .withFirstHand([GARDENS_ALLURE, FOREST_PARTNER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function setupLootFuseCongregantShape() {
  givenGameState({ seed: 45, activePlayer: "first", roundCount: 6 })
    .withFirstPP(6, 6)
    .withFirstHand([RETURNING_SLASH, CONGREGANT])
    .build();
  state.gameStarted = true;
  state.phase = "main";
  whenPlayCard("first", 1);
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("Forest/Loot fuse lifecycle via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    mountAdapter();
  });

  it("Garden's Allure fuse: no lifecycle guard; fused draw-2; clean prompt; undo chain", () => {
    setupGardensAllureHand();
    const allure = getHand(state, "first").find(
      (c) => c.id === GARDENS_ALLURE,
    )!;
    const partner = getHand(state, "first").find(
      (c) => c.id === FOREST_PARTNER,
    )!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: allure.uid });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.requiresConfirmation).toBe(true);

    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: partner.uid },
    });
    expect(confirmOnClick).toBeTypeOf("function");
    confirmOnClick!();

    expect(allure.isFused).toBe(true);
    expect(allure.spell).toEqual([{ op: "draw", source: "deck", count: 2 }]);
    expect(getHand(state, "first").some((c) => c.uid === partner.uid)).toBe(
      false,
    );
    expect(getBanish(state, "first").some((c) => c.uid === partner.uid)).toBe(
      true,
    );
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(flaggedAnywhere()).toEqual([]);

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(getHand(state, "first").some((c) => c.uid === allure.uid)).toBe(
      true,
    );
    expect(getHand(state, "first").some((c) => c.uid === partner.uid)).toBe(
      true,
    );
  });

  it("Returning Slash loot fuse (Congregant fanfare partners): lifecycle + fused spell", () => {
    setupLootFuseCongregantShape();
    const slash = getHand(state, "first").find(
      (c) => c.id === RETURNING_SLASH,
    )!;
    const boots = getHand(state, "first").find(
      (c) => c.name === "Gilded Boots",
    )!;
    expect(boots).toBeDefined();

    dispatch(state, { type: "FUSE", player: "first", cardUid: slash.uid });
    expect(state.pendingTargetEffect).toBeDefined();

    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: boots.uid },
    });
    expect(confirmOnClick).toBeTypeOf("function");
    confirmOnClick!();

    expect(slash.isFused).toBe(true);
    expect(
      (slash.spell as CardInstance["spell"])?.some(
        (e: any) => e.op === "gate" && e.condition === "has_fuse_materials",
      ),
    ).toBe(true);
    expect(getHand(state, "first").some((c) => c.uid === boots.uid)).toBe(
      false,
    );
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(flaggedAnywhere()).toEqual([]);

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(getHand(state, "first").some((c) => c.uid === slash.uid)).toBe(true);
    expect(getHand(state, "first").some((c) => c.uid === boots.uid)).toBe(true);
  });
});
