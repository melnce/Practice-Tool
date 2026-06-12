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

import * as actions from "../../src/ui/zones/actions.js";

function minimalFollower(uid: string): CardInstance {
  return {
    uid,
    id: "10001110",
    name: "Test Follower",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    base_attack: 2,
    base_defense: 2,
    buffs: { attack: 0, defense: 0 },
    owner: "first",
  } as CardInstance;
}

describe("cross-zone reconciliation", () => {
  beforeEach(() => {
    resetGameState(1);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    document.body.innerHTML = `
      <div id="blueHand" class="zone hand-zone"></div>
      <div id="blueBoard" class="zone board-zone"></div>
    `;
  });

  it("hand→board creates a fresh node with board chrome, not the hand node", () => {
    const card = minimalFollower("card_x");
    state.players.first.hand = [card];
    state.players.first.board = [];

    const rerender = () => {
      renderZone("blueHand", state.players.first.hand, state, rerender, true);
      renderZone("blueBoard", state.players.first.board, state, rerender);
    };
    rerender();

    const handSlot = document.querySelector(
      '#blueHand [data-instance-id="card_x"]',
    ) as HTMLElement;
    expect(handSlot).toBeTruthy();
    expect(handSlot.classList.contains("hand-slot")).toBe(true);
    const handCard = handSlot.querySelector(".card") as HTMLElement;
    expect(handCard.dataset.zone).toBe("hand");

    state.players.first.hand = [];
    state.players.first.board = [card];
    rerender();

    const boardEl = document.querySelector(
      '#blueBoard [data-instance-id="card_x"]',
    ) as HTMLElement;
    expect(boardEl).toBeTruthy();
    expect(boardEl).not.toBe(handSlot);
    expect(boardEl).not.toBe(handCard);
    expect(document.querySelector('#blueHand [data-instance-id="card_x"]')).toBeNull();
    expect(boardEl.dataset.zone).toBe("board");
    expect(boardEl.querySelector(".stat-plate[data-stat='attack']")).toBeTruthy();
  });

  it("board nodes do not carry hand-only fuse listeners", async () => {
    const card = minimalFollower("card_y");
    card.fuse_recipes = [{ id: "test" }] as CardInstance["fuse_recipes"];
    state.players.first.board = [card];

    const rerender = () => {
      renderZone("blueBoard", state.players.first.board, state, rerender);
    };
    rerender();

    const boardEl = document.querySelector(
      '#blueBoard [data-instance-id="card_y"]',
    ) as HTMLElement;
    expect(boardEl).toBeTruthy();

    const fuseClick = vi.fn();
    boardEl.addEventListener("click", fuseClick);
    boardEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fuseClick).toHaveBeenCalled();
    // Hand fuse path calls handleFuse via guard — board card has no fuse_recipes handler wired
    expect(vi.mocked(actions.handleFuse)).not.toHaveBeenCalled();
  });
});
