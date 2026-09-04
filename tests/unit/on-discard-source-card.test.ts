/**
 * on_discard effects must run with the discarded card as sourceCard.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const BEHEADING = "10643310";
const RESOLUTE = "10641110";
const FILLER = "10111310";

function setupTurn(hand: string[], extra: { pp?: number } = {}): void {
  givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: 6,
  })
    .withFirstPP(extra.pp ?? 7, 6)
    .withFirstHand(hand)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function discardHandCard(player: "first" | "second", cardId: string): void {
  const card = getHand(state, player).find((c) => c.id === cardId);
  if (!card) throw new Error(`Card not in hand: ${cardId}`);
  resolvePendingTarget(card.uid);
}

describe("on_discard sourceCard", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Beheading Eld Blades (10643310)", () => {
    const printed =
      "When this card is discarded, if its cost is 7, add a Beheading Eld Blades to your hand and set its cost to 5. If this card's cost is 5, add a Beheading Eld Blades to your hand and set its cost to 3.\nDeal X damage to all enemy followers. X is this card's cost.";

    it("when discarded at cost 7: adds one copy at cost 5", () => {
      setupTurn([RESOLUTE, BEHEADING], { pp: 3 });
      whenPlayCard("first", 0);
      discardHandCard("first", BEHEADING);
      const added = thenHand("first").filter((c) => c.id === BEHEADING);
      expect(added).toHaveLength(1);
      expect(getEffectiveCost(added[0]!)).toBe(5);
      expect(printed).toContain("if its cost is 7");
    });

    it("when discarded at cost 5: adds one copy at cost 3", () => {
      setupTurn([RESOLUTE]);
      const reduced = createCard(BEHEADING, "hand", "first");
      reduced.cost = 5;
      state.players.first.hand.push(reduced);
      whenPlayCard("first", 0);
      discardHandCard("first", BEHEADING);
      const added = thenHand("first").filter((c) => c.id === BEHEADING);
      expect(added).toHaveLength(1);
      expect(getEffectiveCost(added[0]!)).toBe(3);
      expect(printed).toContain("If this card's cost is 5");
    });

    it("when discarded at cost 3: does not add another copy", () => {
      setupTurn([RESOLUTE]);
      const reduced = createCard(BEHEADING, "hand", "first");
      reduced.cost = 3;
      state.players.first.hand.push(reduced);
      whenPlayCard("first", 0);
      const countBefore = thenHand("first").filter(
        (c) => c.id === BEHEADING,
      ).length;
      discardHandCard("first", BEHEADING);
      const countAfter = thenHand("first").filter(
        (c) => c.id === BEHEADING,
      ).length;
      expect(countAfter).toBe(countBefore - 1);
    });
  });

  describe("bystander discard", () => {
    it("discarding a card with no on_discard adds nothing extra", () => {
      setupTurn([RESOLUTE, FILLER], { pp: 3 });
      whenPlayCard("first", 0);
      const handBefore = thenHand("first").length;
      discardHandCard("first", FILLER);
      expect(thenHand("first").length).toBe(handBefore - 1);
    });
  });
});
