/**
 * @vitest-environment jsdom
 *
 * Barrier overlay must leave the DOM when the engine consumes the shield.
 * Drive the real board render path (renderZone → renderCardDOM), not
 * applyBarrierOverlay in isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import type { CardInstance, CardTemplate } from "../../src/core/types/index.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { handleKeyword } from "../../src/logic/effects/ops/keyword/unified.js";
import { renderZone } from "../../src/ui/zones/index.js";

function setupBoardDom(): void {
  document.body.innerHTML = `
    <div id="blueBoard"></div>
    <div id="cardTooltip"></div>
  `;
}

function vanillaFollowerTemplate(
  name: string,
  keywords: string[] = [],
): CardTemplate {
  return {
    id: "test_" + name,
    uid: "temp_" + name,
    name,
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 3,
    format: "rotation",
    set_id: "0000",
    faction: "neutral",
    base_id: "0000",
    keywords,
  };
}

function putOnAlliedBoard(template: CardTemplate): CardInstance {
  const card = makeCardFromDB(template, "first");
  pushToBoard(state.players.first.board, "first", card);
  return card;
}

function renderAlliedBoard(): void {
  renderZone("blueBoard", state.players.first.board, state, renderAlliedBoard);
}

describe("board overlays follow runtime keyword flags", () => {
  beforeEach(() => {
    setupBoardDom();
    resetGameState(7);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("removes .barrier-overlay after dealDamage consumes Barrier (no stat change)", () => {
    const card = putOnAlliedBoard(
      vanillaFollowerTemplate("Barrier Follower", ["barrier"]),
    );

    expect(card.hasBarrier).toBe(true);
    const printedKeywordCount = card.keywords?.length ?? 0;
    const defenseBefore = Number(card.defense);

    renderAlliedBoard();
    const board = document.getElementById("blueBoard");
    expect(board?.querySelector(".barrier-overlay")).not.toBeNull();

    const result = dealDamage(card, 1);
    expect(result.barrierPopped).toBe(true);
    expect(card.hasBarrier).toBe(false);
    expect(Number(card.defense)).toBe(defenseBefore);
    expect(card.keywords?.length ?? 0).toBe(printedKeywordCount);

    renderAlliedBoard();
    expect(board?.querySelector(".barrier-overlay")).toBeNull();
  });

  it("shows .ward-overlay after an effect grants Ward with no stat change", () => {
    const card = putOnAlliedBoard(vanillaFollowerTemplate("Plain Follower"));

    expect(card.hasWard).toBeFalsy();
    const attackBefore = Number(card.attack);
    const defenseBefore = Number(card.defense);

    renderAlliedBoard();
    const board = document.getElementById("blueBoard");
    expect(board?.querySelector(".ward-overlay")).toBeNull();

    const granted = handleKeyword(
      { op: "keyword", action: "grant", keywords: ["ward"] } as any,
      {
        owner: "first",
        sourceCard: card,
        targets: [card],
        effectsQueue: [],
      },
    );
    expect(granted.kind).toBe("done");
    expect(card.hasWard).toBe(true);
    expect(Number(card.attack)).toBe(attackBefore);
    expect(Number(card.defense)).toBe(defenseBefore);

    renderAlliedBoard();
    expect(board?.querySelector(".ward-overlay")).not.toBeNull();
  });
});
