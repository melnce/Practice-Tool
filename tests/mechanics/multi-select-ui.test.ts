/**
 * Multi-select must re-render after partial picks so isSelected updates.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { highlightSelectable } from "../../src/logic/core/targeting.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { getMemoizedViewModel } from "../../src/ui/zones/memoization.js";
import { buildZoneContext } from "../../src/ui/zones/selectors.js";

describe("Multi-select UI feedback", () => {
  let renderCalls = 0;

  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = false;
    renderCalls = 0;
    injectAdapter({
      render: () => {
        renderCalls++;
      },
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
      triggerConfirmButtonClick: () => {},
    });
  });

  it("first partial pick should trigger render (continue path)", () => {
    givenGameState({ seed: 4, activePlayer: "first" }).build();

    const a = createCard("10001110", "board", "second");
    const b = createCard("10001120", "board", "second");
    a.uid = "t_a";
    b.uid = "t_b";
    state.players.second.board = [a, b];

    setPendingTarget({
      eff: { op: "damage", amount: 1, select: 2 } as any,
      owner: "first",
      sourceCard: null,
      pool: [a, b],
      targets: [],
      selectCount: 2,
      requiresConfirmation: false,
    });
    highlightSelectable([a, b]);

    renderCalls = 0;
    resolvePendingTarget(a.uid);

    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.targetUids).toEqual([a.uid]);
    expect(renderCalls).toBeGreaterThan(0);
  });

  it("memoization invalidates when targetUids gains a pick (isSelected)", () => {
    givenGameState({ seed: 5, activePlayer: "first" }).build();

    const a = createCard("10001110", "board", "second");
    a.uid = "t_a";
    a.__uiSelectable = true;
    state.players.second.board = [a];

    state.pendingTargetEffect = {
      eff: { op: "damage" },
      owner: "first",
      sourceCard: null,
      pool: [a],
      poolUids: [a.uid],
      targetUids: [],
      selectCount: 2,
    } as any;

    const ctx = buildZoneContext("redBoard", state);
    const vmBefore = getMemoizedViewModel(a, 0, ctx, state);
    expect(vmBefore.isSelected).toBe(false);

    state.pendingTargetEffect!.targetUids = [a.uid];
    const vmAfter = getMemoizedViewModel(a, 0, ctx, state);
    expect(vmAfter.isSelected).toBe(true);
  });
});
