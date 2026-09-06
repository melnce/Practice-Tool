/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../src/core/gameState.js";
import { render } from "../../src/ui/render.js";
import { setPendingModeChoice } from "../../src/logic/core/resolutionPause.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";

function mountRenderDom(): void {
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
    <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
  `;
}

describe("mode modal restore from state", () => {
  beforeEach(() => {
    resetUidCounter();
    mountRenderDom();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("render re-shows choice modal when pendingModeChoice is on state", () => {
    setPendingModeChoice({
      owner: "first",
      optionCount: 2,
      selectCount: 1,
      options: [
        { label: "A", effects: [] },
        { label: "B", effects: [] },
      ],
      resumeEffects: [],
    });

    render();

    expect(document.querySelector(".choice-modal")).toBeTruthy();
    expect(document.querySelectorAll(".choice-option").length).toBe(2);
  });
});
