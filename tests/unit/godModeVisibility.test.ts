/**
 * @vitest-environment jsdom
 *
 * God Mode panel visibility must not depend on deck filename.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  render,
  isGodModeEnabled,
  setGodModeEnabled,
} from "../../src/ui/render.js";

function setupGodModeDom(): void {
  document.body.innerHTML = `
    <div id="blueGodMode" style="display: none">
      <div class="god-target-label">Target: Blue (1st)</div>
    </div>
    <div id="blueHP"></div>
    <div id="redHP"></div>
    <div id="bluePP"></div>
    <div id="redPP"></div>
    <div id="blueShadows"></div>
    <div id="redShadows"></div>
    <div id="blueHand"></div>
    <div id="redHand"></div>
    <div id="blueBoard"></div>
    <div id="redBoard"></div>
    <div id="blueLeader"></div>
    <div id="redLeader"></div>
    <div id="blueHandCount"></div>
    <div id="redHandCount"></div>
    <div id="blueDeckCount"></div>
    <div id="redDeckCount"></div>
    <div id="blueGraveCount"></div>
    <div id="redGraveCount"></div>
    <div id="endTurnBlue"></div>
    <div id="endTurnRed"></div>
    <div id="blueCrests"></div>
    <div id="redCrests"></div>
    <div id="bluePlayedList"></div>
    <div id="redPlayedList"></div>
    <div id="blueDestroyedList"></div>
    <div id="redDestroyedList"></div>
    <div id="redBoost"></div>
    <div id="boostPipEarly"></div>
    <div id="boostPipLate"></div>
    <div id="gameOverOverlay"></div>
  `;
}

describe("God Mode visibility", () => {
  beforeEach(() => {
    resetGameState(1);
    setGodModeEnabled(false);
    setupGodModeDom();
    state.players.first.deckFile = "0_testing_vanilla.json";
    state.players.second.deckFile = "0_testing_vanilla.json";
    state.gameStarted = true;
    state.phase = "main";
  });

  it("keeps #blueGodMode hidden for 0_testing deck when toggle is off", () => {
    expect(isGodModeEnabled()).toBe(false);
    render();

    const panel = document.getElementById("blueGodMode") as HTMLElement;
    expect(panel.style.display).toBe("none");
  });

  it("shows #blueGodMode when toggle is on, regardless of deck filename", () => {
    setGodModeEnabled(true);

    const panel = document.getElementById("blueGodMode") as HTMLElement;
    expect(panel.style.display).toBe("block");
  });

  it("updates target label for active player when panel is visible", () => {
    setGodModeEnabled(true);
    state.activePlayer = "second";
    render();

    const label = document.querySelector(".god-target-label");
    expect(label?.textContent).toBe("Target: Red (2nd)");
  });
});
