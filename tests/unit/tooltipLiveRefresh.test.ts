/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { clearTooltipCounterCache } from "../../src/ui/tooltipCounters.js";
import { attachTooltip, refreshActiveTooltips } from "../../src/ui/tooltips.js";

function dracheFixture(): CardInstance {
  return {
    id: "10844110",
    uid: "drache-test-uid",
    name: "Drache & Aluzard, Burning Blood",
    class: "Dragoncraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    tribes: [],
    owner: "first",
    fanfare: [
      {
        op: "gate",
        condition: "named_enter_count",
        name: "Drache & Aluzard, Burning Blood",
        count: 2,
        effects: [{ op: "draw", count: 1 }],
      },
    ],
    lastwords: [
      {
        op: "add_crest",
        name: "Drache & Aluzard, Burning Blood",
        countdown: 2,
      },
    ],
    description: "Fanfare: ...",
    buffs: { attack: 0, defense: 0 },
  } as CardInstance;
}

describe("attachTooltip live refresh", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="card" class="card"></div><div id="cardTooltip"></div>';
    resetGameState(7);
    state.gameStarted = true;
    state.players.first.followerEnterHistory = [];
    clearTooltipCounterCache();
  });

  it("updates Drache counter via refreshActiveTooltips without RAF", () => {
    const card = dracheFixture();
    state.players.first.hand = [card];

    const div = document.getElementById("card") as HTMLElement;
    const tooltipEl = document.getElementById("cardTooltip") as HTMLElement;
    div.dataset.uid = card.uid;

    attachTooltip(div, tooltipEl, card, true);
    div.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    expect(tooltipEl.querySelector(".dynamic-counter-value")?.textContent).toBe(
      "0/2",
    );
    expect((div as any).__ttRaf).toBeUndefined();

    state.players.first.followerEnterHistory.push({
      name: "Drache & Aluzard, Burning Blood",
      tribes: [],
      cardId: "10844110",
    });

    Object.defineProperty(div, "matches", {
      configurable: true,
      value: (selector: string) =>
        selector === ":hover"
          ? true
          : HTMLElement.prototype.matches.call(div, selector),
    });

    refreshActiveTooltips();

    expect(tooltipEl.querySelector(".dynamic-counter-value")?.textContent).toBe(
      "1/2",
    );
    expect((div as any).__ttRaf).toBeUndefined();
  });
});
