/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { renderZone } from "../../src/ui/zones/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

vi.mock("../../src/ui/drag.js", () => ({
  enableBoardDropForOwnSide: vi.fn(),
  wireFieldSlotDragHighlight: vi.fn(),
  enableCardDragFromHand: vi.fn(),
  enableCardEvoDrop: vi.fn(),
  enableAttackerDrag: vi.fn(),
  enableEnemyFollowerDrop: vi.fn(),
}));

vi.mock("../../src/ui/zones/actions.js", () => ({
  handleFuse: vi.fn(),
  handleMulliganToggle: vi.fn(),
  handleResolveTarget: vi.fn(),
  handleEngage: vi.fn(),
  handlePlayCard: vi.fn(),
}));

describe("memoization + reconcile integration", () => {
  beforeEach(() => {
    resetGameState(2);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    document.body.innerHTML = `<div id="blueBoard" class="zone board-zone"></div>`;
  });

  it("in-place stat mutation reuses node and updates displayed defense", () => {
    const card = {
      uid: "memo_card",
      id: "10001110",
      name: "Memo Test",
      type: "Follower",
      cost: 2,
      attack: 3,
      defense: 5,
      base_attack: 3,
      base_defense: 5,
      buffs: { attack: 0, defense: 0 },
      owner: "first",
      can_attack: false,
      hasAttacked: false,
    } as CardInstance;

    state.players.first.board = [card];
    const rerender = () => {
      renderZone("blueBoard", state.players.first.board, state, rerender);
    };
    rerender();

    const el = document.querySelector(
      '#blueBoard [data-instance-id="memo_card"]',
    ) as HTMLElement;
    expect(el).toBeTruthy();
    const defPlate = el.querySelector(
      '.stat-plate[data-stat="defense"]',
    ) as HTMLElement;
    expect(defPlate?.textContent).toBe("5");

    card.defense = 2;
    rerender();

    const el2 = document.querySelector(
      '#blueBoard [data-instance-id="memo_card"]',
    ) as HTMLElement;
    expect(el2).toBe(el);
    const defPlate2 = el2.querySelector(
      '.stat-plate[data-stat="defense"]',
    ) as HTMLElement;
    expect(defPlate2?.textContent).toBe("2");
    expect(defPlate2?.dataset.statTint).toBe("dmg");
  });
});
