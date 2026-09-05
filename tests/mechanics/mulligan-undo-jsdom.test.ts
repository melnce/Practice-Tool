/**
 * @vitest-environment jsdom
 *
 * Mulligan overlay and undo button wiring after undo into mulligan.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch } from "../../src/engine.js";
import { initUndoRedo } from "../../src/boot/undoRedo.js";
import { render } from "../../src/ui/render.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { beginMulligan } from "../../src/logic/mulligan.js";

function deckFill(id: string, n: number) {
  return Array.from({ length: n }, () => id);
}

function mountMulliganDom(): void {
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
    <button id="blueMulliganConfirm" style="display:none"></button>
    <button id="redMulliganConfirm" style="display:none"></button>
    <button id="undoBtn" type="button" disabled></button>
    <button id="redoBtn" type="button" disabled></button>
    <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
  `;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = false;
});

describe("mulligan overlay after undo (jsdom)", () => {
  beforeEach(() => {
    resetUidCounter();
    mountMulliganDom();
    setHistoryEnabled(true);
    initUndoRedo();

    const filler = "10111310";
    givenGameState({ seed: 424242 })
      .withFirstHand(deckFill(filler, 4))
      .withSecondHand(deckFill(filler, 4))
      .withFirstDeck(deckFill(filler, 36))
      .withSecondDeck(deckFill(filler, 36))
      .build();
    state.gameStarted = true;
    beginMulligan();
    render();
  });

  it("undo into mulligan shows overlay with restored picks; undo button enabled", () => {
    const [a, b] = getHand(state, "first")
      .filter((c) => (c as any).__mulliganSelectable)
      .map((c) => c.uid);
    expect(a).toBeTruthy();

    dispatch(state, { type: "TOGGLE_MULLIGAN", player: "first", cardUid: a! });
    dispatch(state, { type: "TOGGLE_MULLIGAN", player: "first", cardUid: b! });
    dispatch(state, { type: "CONFIRM_MULLIGAN", player: "first" });
    render();

    dispatch(state, { type: "UNDO" });
    render();

    expect(state.phase).toBe("mulligan");
    expect(state.mulliganStage).toBe("first");
    expect(state.mulliganFirstSelected?.has(a!)).toBe(true);
    expect(state.mulliganFirstSelected?.has(b!)).toBe(true);
    expect(document.body.classList.contains("mulligan-active")).toBe(true);

    const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement;
    expect(undoBtn?.disabled).toBe(false);

    const selectedInDom = document.querySelectorAll(
      "#blueHand .card.selected",
    ).length;
    expect(selectedInDom).toBe(2);
  });
});
