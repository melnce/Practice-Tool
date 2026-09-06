/**
 * __uiSelectable must not survive zone moves (hand → deck) or outlive prompt cleanup.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenHand,
  thenDeck,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getBoard,
  getHand,
  getDeck,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import { clearSelectableFlags } from "../../src/logic/core/targeting.js";
import { drawCard } from "../../src/core/utils.js";
import "../../src/logic/core/effects/index.js";

const EARRINGS = "10761210";
const RETURN_CARD = "10001110";
const DRAW_TOP = "10021110";
const FILLER = "10102110";

type PlayerSlot = "first" | "second";

function allZoneCards(player: PlayerSlot): CardInstance[] {
  return [
    ...getBoard(state, player),
    ...getHand(state, player),
    ...getDeck(state, player),
    ...getGraveyard(state, player),
    ...getBanish(state, player),
  ];
}

function flaggedAnywhere(): Array<{
  player: PlayerSlot;
  uid: string;
  zone: string;
}> {
  const hits: Array<{ player: PlayerSlot; uid: string; zone: string }> = [];
  for (const player of ["first", "second"] as const) {
    for (const [zone, cards] of [
      ["board", getBoard(state, player)],
      ["hand", getHand(state, player)],
      ["deck", getDeck(state, player)],
      ["graveyard", getGraveyard(state, player)],
      ["banish", getBanish(state, player)],
    ] as const) {
      for (const c of cards) {
        if (c?.__uiSelectable) {
          hits.push({ player, uid: c.uid, zone });
        }
      }
    }
  }
  return hits;
}

describe("selectable flags (__uiSelectable)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("Earrings return-to-deck: returned deck card is not flagged after resolve", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHand([EARRINGS, RETURN_CARD, FILLER])
      .withFirstDeck([DRAW_TOP, FILLER])
      .withFirstPP(10, 10)
      .build();

    const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
    const returnUid = toReturn.uid;

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(toReturn.__uiSelectable).toBe(true);

    resolvePendingTarget(returnUid);

    expect(state.pendingTargetEffect).toBeUndefined();
    const inDeck = thenDeck("first").find((c) => c.uid === returnUid);
    expect(inDeck).toBeDefined();
    expect(inDeck!.__uiSelectable).toBeUndefined();
  });

  it("Earrings return-to-deck: drawing the returned card back does not flag it", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHand([EARRINGS, RETURN_CARD, FILLER])
      .withFirstDeck([DRAW_TOP, FILLER])
      .withFirstPP(10, 10)
      .build();

    const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
    const returnUid = toReturn.uid;

    whenPlayCard("first", 0);
    resolvePendingTarget(returnUid);

    const deck = getDeck(state, "first");
    const returnedIdx = deck.findIndex((c) => c.uid === returnUid);
    expect(returnedIdx).toBeGreaterThanOrEqual(0);
    const [returned] = deck.splice(returnedIdx, 1);
    deck.push(returned!);

    const hand = getHand(state, "first");
    drawCard(hand, deck, "first");

    const redrawn = hand.find((c) => c.uid === returnUid);
    expect(redrawn).toBeDefined();
    expect(redrawn!.__uiSelectable).toBeUndefined();
  });

  it("Earrings return-to-deck: no card in any zone is flagged after prompt resolves", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHand([EARRINGS, RETURN_CARD, FILLER])
      .withFirstDeck([DRAW_TOP, FILLER])
      .withFirstPP(10, 10)
      .build();

    const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;

    whenPlayCard("first", 0);
    resolvePendingTarget(toReturn.uid);

    expect(flaggedAnywhere()).toEqual([]);
  });

  it("clearSelectableFlags clears __uiSelectable on deck cards", () => {
    givenGameState({ seed: 1 }).withFirstDeck([FILLER]).build();
    const deckCard = thenDeck("first")[0]!;
    deckCard.__uiSelectable = true;

    clearSelectableFlags();

    expect(deckCard.__uiSelectable).toBeUndefined();
    expect(allZoneCards("first").every((c) => !c.__uiSelectable)).toBe(true);
  });
});
