/**
 * @vitest-environment jsdom
 *
 * Player-facing fuse confirm after undo: render.ts must re-arm the confirm
 * control from serializable pending data (not a stored closure).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch } from "../../src/engine.js";
import { initAdapter } from "../../src/boot/adapterBoot.js";
import { initUndoRedo } from "../../src/boot/undoRedo.js";
import { render } from "../../src/ui/render.js";
import {
  captureSnapshot,
  setHistoryEnabled,
  resetHistory,
} from "../../src/core/history.js";
import { getHand } from "../../src/core/playerHelpers.js";
import {
  canConfirmPendingTarget,
  getPendingConfirmKey,
} from "../../src/logic/core/pendingTarget/confirmRegistry.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";

const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";

function mountFuseDom(): void {
  document.body.innerHTML = `
    <div id="blueHand" class="zone hand-zone"></div>
    <div id="redHand" class="zone hand-zone"></div>
    <div id="blueBoard" class="zone board-zone"></div>
    <div id="redBoard" class="zone board-zone"></div>
    <div id="blueLeader" class="leader"><span id="blueHP">20</span></div>
    <div id="redLeader" class="leader"><span id="redHP">20</span></div>
    <div id="blueHandCount">0</div>
    <div id="redHandCount">0</div>
    <div id="blueDeckCount">0</div>
    <div id="redDeckCount">0</div>
    <div id="blueGraveCount">0</div>
    <div id="redGraveCount">0</div>
    <div id="blueShadows">0</div>
    <div id="redShadows">0</div>
    <div id="bluePP">0</div>
    <div id="redPP">0</div>
    <div id="endTurnBlue" style="display:none"></div>
    <div id="endTurnRed" style="display:none"></div>
    <div id="blueNormalEvo"></div>
    <div id="redNormalEvo"></div>
    <div id="blueSuperEvo"></div>
    <div id="redSuperEvo"></div>
    <div id="boostPips"></div>
    <div id="boostPipEarly"></div>
    <div id="boostPipLate"></div>
    <div id="redBoost"></div>
    <div id="puzzleStatus"></div>
    <div id="scriptStatus"></div>
    <div id="checkpointStatus"></div>
    <div id="gameSeedPanel" hidden></div>
    <div id="gameSeedValue"></div>
    <div id="blueCrests"></div>
    <div id="redCrests"></div>
    <div id="targetingConfirmation" style="display:none"></div>
    <button id="undoBtn" type="button" disabled></button>
    <button id="redoBtn" type="button" disabled></button>
    <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
  `;
}

beforeAll(async () => {
  (globalThis as any).HEADLESS = false;
  await initCardDatabaseNode();
});

describe("fuse confirm after undo (jsdom)", () => {
  beforeEach(() => {
    resetUidCounter();
    mountFuseDom();
    initAdapter();
    setHistoryEnabled(true);
    resetHistory();
    initUndoRedo();

    givenGameState({ seed: 10, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([GEAR_AMBITION, GEAR_REMEMBRANCE])
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("undo into fuse prompt re-shows confirm; click completes same result", () => {
    const ambition = getHand(state, "first").find(
      (c) => c.id === GEAR_AMBITION,
    )!;
    const remembrance = getHand(state, "first").find(
      (c) => c.id === GEAR_REMEMBRANCE,
    )!;

    dispatch(state, { type: "FUSE", player: "first", cardUid: ambition.uid });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: remembrance.uid },
    });
    render();

    const confirmBtn = document.querySelector(
      "#targetingConfirmation .confirm-targets-btn",
    ) as HTMLButtonElement | null;
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();
    render();

    const snapDone = captureSnapshot();
    expect(state.lastFuse?.result_name).toBe("Striker Artifact");
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(
      document.querySelector("#targetingConfirmation .confirm-targets-btn"),
    ).toBeNull();

    dispatch(state, { type: "UNDO" });
    render();

    expect(state.pendingTargetEffect?.targetUids).toEqual([remembrance.uid]);
    expect(getPendingConfirmKey(state.pendingTargetEffect!)).toBe(
      "fuse:finalize:gear_multi",
    );
    expect(canConfirmPendingTarget(state.pendingTargetEffect)).toBe(true);

    const restoredBtn = document.querySelector(
      "#targetingConfirmation .confirm-targets-btn",
    ) as HTMLButtonElement | null;
    expect(restoredBtn).toBeTruthy();
    expect(restoredBtn!.disabled).not.toBe(true);

    restoredBtn!.click();
    render();

    expect(captureSnapshot()).toEqual(snapDone);
    expect(state.lastFuse?.result_name).toBe("Striker Artifact");
    expect(state.pendingTargetEffect).toBeUndefined();
  });
});
