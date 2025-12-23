import { describe, it, expect, vi, beforeEach } from "vitest";
import { startNewGame, dispatch, getState } from "../../src/engine.js";

// Mock UI rendering to avoid DOM dependency in engine tests
vi.mock("../../src/ui/render.js", () => ({
  render: vi.fn(),
  updateCounts: vi.fn(),
  updateEvoButtonsUI: vi.fn(),
  updateCrestsUI: vi.fn(),
  renderZone: vi.fn(),
  makeLeaderDroppable: vi.fn(),
  wireHistoryImagePreview: vi.fn(),
}));

// Mock sound/assets if needed
vi.mock("../../src/ui/dom.js", () => ({
  byId: () => document.createElement("div"),
  clear: () => {},
  wireClick: () => {},
  getDragData: () => "",
  setDragData: () => {},
}));

describe("Engine Golden Path", () => {
  beforeEach(async () => {
    // Reset DOM environment mock
    document.body.innerHTML = `
      <select id="blueDeckSelect"><option value="sample_blue">Blue</option></select>
      <select id="redDeckSelect"><option value="sample_red">Red</option></select>
      <input id="seedInput" value="12345" />
      <div id="blueHand"></div><div id="redHand"></div>
      <div id="blueBoard"></div><div id="redBoard"></div>
      <div id="blueLeader"></div><div id="redLeader"></div>
    `;
    // Add other necessary DOM elements if startNewGame assumes them
    ["blueHP", "redHP", "bluePP", "redPP", "blueShadows", "redShadows"].forEach(
      (id) => {
        const d = document.createElement("div");
        d.id = id;
        document.body.appendChild(d);
      },
    );
  });

  it("should drive game state via dispatch", async () => {
    // 1. Start Game
    // 1. Start Game
    const stateStart = await startNewGame({
      deckAId: "sample_blue",
      deckBId: "sample_red",
      seed: 12345,
    });
    expect(stateStart).toBeDefined();
    expect(stateStart.isBlueTurn).toBe(true);
    expect(stateStart.roundCount).toBe(1);

    // Store snapshot of initial state basics
    const initialBlueHandSize = stateStart.blueHand.length;

    // 2. Dispatch Action: End Turn (Blue -> Red)
    // We pass stateStart as "currentState" context, though currently engine uses singleton.
    const stateAfterEndTurn = dispatch(stateStart, { type: "END_TURN" });

    expect(stateAfterEndTurn.isBlueTurn).toBe(false);
    // expect(stateAfterEndTurn.activePlayer).toBe("red"); // Property doesn't exist on GameState
    // Red draws a card at start of their turn
    expect(stateAfterEndTurn.redHand.length).toBeGreaterThan(0);

    // 3. Dispatch Action: Undo
    const stateRestored = dispatch(stateAfterEndTurn, { type: "UNDO" });

    expect(stateRestored.isBlueTurn).toBe(true);
    // expect(stateRestored.activePlayer).toBe("blue");
    expect(stateRestored.blueHand.length).toBe(initialBlueHandSize);

    // 4. Dispatch Action: Redo
    const stateRedone = dispatch(stateRestored, { type: "REDO" });
    expect(stateRedone.isBlueTurn).toBe(false);
  });
});
