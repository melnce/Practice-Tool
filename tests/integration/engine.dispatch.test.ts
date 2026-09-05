/**
 * Engine dispatch golden path — start, end turn, undo, redo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { startNewGame, dispatch } from "../../src/engine.js";

vi.mock("../../src/ui/render.js", () => ({
  render: vi.fn(),
  updateCounts: vi.fn(),
  updateEvoButtonsUI: vi.fn(),
  updateCrestsUI: vi.fn(),
  renderZone: vi.fn(),
  makeLeaderDroppable: vi.fn(),
  wireHistoryImagePreview: vi.fn(),
}));

vi.mock("../../src/ui/dom.js", () => ({
  byId: () => document.createElement("div"),
  clear: () => {},
  wireClick: () => {},
  getDragData: () => "",
  setDragData: () => {},
}));

describe("Engine dispatch golden path", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="blueDeckSelect"><option value="sample_blue">Blue</option></select>
      <select id="redDeckSelect"><option value="sample_red">Red</option></select>
      <input id="seedInput" value="12345" />
      <div id="blueHand"></div><div id="redHand"></div>
      <div id="blueBoard"></div><div id="redBoard"></div>
      <div id="blueLeader"></div><div id="redLeader"></div>
    `;
    ["blueHP", "redHP", "bluePP", "redPP", "blueShadows", "redShadows"].forEach(
      (id) => {
        const d = document.createElement("div");
        d.id = id;
        document.body.appendChild(d);
      },
    );
  });

  it("drives game state via dispatch (END_TURN, UNDO, REDO)", async () => {
    const stateStart = await startNewGame({
      deckAId: "sample_blue",
      deckBId: "sample_red",
      seed: 12345,
    });

    expect(stateStart).toBeDefined();
    expect(stateStart.activePlayer).toBe("first");
    expect(stateStart.roundCount).toBe(1);

    const initialFirstHandSize = stateStart.players.first.hand.length;

    const stateAfterEndTurn = dispatch(stateStart, { type: "END_TURN" });
    expect(stateAfterEndTurn.activePlayer).toBe("second");
    expect(stateAfterEndTurn.players.second.hand.length).toBeGreaterThan(0);

    const stateRestored = dispatch(stateAfterEndTurn, { type: "UNDO" });
    expect(stateRestored.activePlayer).toBe("first");
    expect(stateRestored.players.first.hand.length).toBe(initialFirstHandSize);

    const stateRedone = dispatch(stateRestored, { type: "REDO" });
    expect(stateRedone.activePlayer).toBe("second");
  });
});
