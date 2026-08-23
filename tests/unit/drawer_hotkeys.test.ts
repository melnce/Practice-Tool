/**
 * @vitest-environment jsdom
 *
 * Practice hotkeys must work with the settings drawer closed.
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from "vitest";
import "../fixtures/setup.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  canUndo,
  doAction,
  initHistoryHotkeys,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import {
  _resetPositionStoreForTests,
  getCheckpointInfo,
  initCheckpointHotkeys,
  setCheckpoint,
} from "../../src/core/positionStore.js";

describe("drawer-closed hotkeys", () => {
  beforeAll(() => {
    initHistoryHotkeys({ target: document });
    initCheckpointHotkeys({ target: document });
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
      <button id="undoBtn" type="button" disabled></button>
      <button id="redoBtn" type="button" disabled></button>
      <button id="setCheckpointBtn" type="button"></button>
      <button id="restoreCheckpointBtn" type="button" disabled></button>
      <button id="rerollCheckpointBtn" type="button" disabled></button>
      <span id="checkpointStatus">Checkpoint: none</span>
    `;
    resetGameState(1);
    state.gameStarted = true;
    setHistoryEnabled(true);
    resetHistory();
    _resetPositionStoreForTests();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Ctrl+Z undoes while settings drawer stays closed", () => {
    doAction(
      "move",
      () => {
        state.players.first.hp -= 1;
      },
      {},
      { autoRender: false },
    );
    expect(canUndo()).toBe(true);
    expect(
      document.getElementById("settingsDrawer")?.classList.contains("open"),
    ).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(canUndo()).toBe(false);
    expect(state.players.first.hp).toBe(20);
    expect(
      document.getElementById("settingsDrawer")?.classList.contains("open"),
    ).toBe(false);
  });

  it("F6 sets checkpoint while settings drawer stays closed", () => {
    expect(getCheckpointInfo().checkpointCursor).toBeNull();

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F6",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(getCheckpointInfo().checkpointCursor).not.toBeNull();
    expect(
      document.getElementById("settingsDrawer")?.classList.contains("open"),
    ).toBe(false);
  });

  it("F8 rerolls after F6 with drawer closed", () => {
    setCheckpoint();
    expect(getCheckpointInfo().rerollCount).toBe(0);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F8",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(getCheckpointInfo().rerollCount).toBe(1);
    expect(
      document.getElementById("settingsDrawer")?.classList.contains("open"),
    ).toBe(false);
  });
});
