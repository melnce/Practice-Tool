/**
 * Real-play pin: spellboost cost reduction on deck-loaded / drawn hand cards.
 *
 * Uses loadPlayerDeckFromRaw → drawCard — no harness createCard, no manual
 * applyKeywordsFromList. This is the path production uses for cards in hand.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  whenRunEffects,
} from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { loadPlayerDeckFromRaw } from "../../src/data/deckLoader.js";
import { drawCard } from "../../src/core/utils.js";
import { getHand, getDeck } from "../../src/core/playerHelpers.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import type { RawDeck } from "../../src/data/rawDeck.js";
import "../../src/logic/core/effects/index.js";

const DIMENSION_CLIMB = "10134310";
const BLAZE_DESTROYER = "10032120";

function drawTopDeckCard(owner: "first" | "second" = "first") {
  const hand = getHand(state, owner);
  const deck = getDeck(state, owner);
  drawCard(hand, deck, owner);
  return hand[hand.length - 1]!;
}

function loadDeckWithTopCard(
  cardId: string,
  owner: "first" | "second" = "first",
) {
  const raw: RawDeck = {
    ordered: true,
    cards: [
      { id: cardId, count: 1 },
      { name: "Marsh Wyrmling", count: 38 },
      { name: "Scaled Lurker", count: 1 },
    ],
  };
  resetGameState(42);
  loadPlayerDeckFromRaw(owner, raw, `qa_${cardId}.json`, false);
}

describe("spellboost cost reduction on deck-loaded hand cards (real play path)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42 }).build();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Dimension Climb drawn via deckLoader + drawCard reduces cost when hand is spellboosted", () => {
    loadDeckWithTopCard(DIMENSION_CLIMB);
    const climb = drawTopDeckCard();
    expect(climb.id).toBe(DIMENSION_CLIMB);

    const cost0 = getEffectiveCost(climb);
    expect(cost0).toBe(18);

    whenRunEffects(
      [{ op: "spellboost", target: "ally:hand", count: 3 } as const],
      "first",
    );

    expect(getEffectiveCost(climb)).toBe(cost0 - 3);
    expect(
      climb.keywordState?.spellboostCount ??
        (climb as { spellboostCount?: number }).spellboostCount,
    ).toBe(3);
  });

  it("Blaze Destroyer drawn via deckLoader + drawCard reduces cost when spellboosted", () => {
    loadDeckWithTopCard(BLAZE_DESTROYER);
    const blaze = drawTopDeckCard();
    expect(blaze.id).toBe(BLAZE_DESTROYER);

    const cost0 = getEffectiveCost(blaze);
    expect(cost0).toBe(10);

    whenRunEffects(
      [{ op: "spellboost", target: "ally:hand", count: 2 } as const],
      "first",
    );

    expect(getEffectiveCost(blaze)).toBe(cost0 - 2);
  });

  it("deckLoader seeds keywordState.spellboost mirror on draw (post-BF1 fix)", () => {
    loadDeckWithTopCard(DIMENSION_CLIMB);
    const climb = drawTopDeckCard();
    expect(climb.keywordState?.spellboost).toEqual({
      reduceCostBy: 1,
      minCost: 0,
    });
  });
});
