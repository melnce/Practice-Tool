/**
 * Engine finding: gear_multi fuse finalize calls clearSelectableFlags inside targeted dispatch.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { setHistoryEnabled } from "../../src/core/history.js";

let confirmOnClick: (() => void) | null = null;

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("gear fuse soak finding", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
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
    });
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand(["10471120", "10471130"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it.fails(
    "FUSE gear_multi Confirm Targets: clearSelectableFlags lifecycle guard (engine path)",
    () => {
      const ambition = state.players.first.hand.find(
        (c) => c.name === "Gear of Ambition",
      )!;
      const remembrance = state.players.first.hand.find(
        (c) => c.name === "Gear of Remembrance",
      )!;

      engineDispatch(state, {
        type: "FUSE",
        player: "first",
        cardUid: ambition.uid,
      });
      engineDispatch(state, {
        type: "CHOOSE_TARGET",
        player: "first",
        target: { type: "card", uid: remembrance.uid },
      });
      expect(confirmOnClick).toBeTypeOf("function");
      confirmOnClick!();
      expect(state.pendingTargetEffect).toBeUndefined();
    },
  );
});
