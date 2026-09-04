/**
 * Deck-loaded card instances must carry owner from enrichDeck through deck/hand zones.
 * Regression for Encroached World (10602210) exact-copy transform on owner-less hand cards.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { loadPlayerDeckFromRaw } from "../../src/data/deckLoader.js";
import { drawCard } from "../../src/core/utils.js";
import { getHand, getDeck } from "../../src/core/playerHelpers.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { whenPlayCard } from "../harness/builders.js";
import type { RawDeck } from "../../src/data/rawDeck.js";
import { initReplayState } from "../../src/logic/core/replayInit.js";
import "../../src/logic/core/effects/index.js";

const ENCROACHED = "10602210";

const VANILLA_DECK: RawDeck = {
  cards: [
    { name: "Marsh Wyrmling", count: 10 },
    { name: "Scaled Lurker", count: 10 },
    { name: "Dune Scorpion", count: 10 },
    { name: "Mountain Behemoth", count: 10 },
  ],
};

function loadBothFromRaw(opts?: { drawOpening?: boolean }) {
  resetGameState(42);
  loadPlayerDeckFromRaw(
    "first",
    VANILLA_DECK,
    "qa_first.json",
    opts?.drawOpening !== false,
  );
  loadPlayerDeckFromRaw(
    "second",
    VANILLA_DECK,
    "qa_second.json",
    opts?.drawOpening !== false,
  );
}

function assertAllOwned(zone: "deck" | "hand", owner: "first" | "second") {
  const cards =
    owner === "first" ? state.players.first[zone] : state.players.second[zone];
  for (const card of cards) {
    expect(card.owner, `${card.name} in ${owner} ${zone}`).toBe(owner);
  }
}

describe("deck instance owner", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42 }).build();
  });

  it("loadPlayerDeckFromRaw assigns owner to every deck and opening-hand card", () => {
    loadBothFromRaw();
    assertAllOwned("deck", "first");
    assertAllOwned("hand", "first");
    assertAllOwned("deck", "second");
    assertAllOwned("hand", "second");
  });

  it("drawing from deck preserves owner on the card", () => {
    loadBothFromRaw({ drawOpening: false });
    const hand = getHand(state, "first");
    const deck = getDeck(state, "first");
    const before = deck.length;
    drawCard(hand, deck, "first");
    expect(deck.length).toBe(before - 1);
    const drawn = hand[hand.length - 1]!;
    expect(drawn.owner).toBe("first");
  });

  it("returning a hand card to deck keeps owner", () => {
    loadBothFromRaw({ drawOpening: false });
    const hand = getHand(state, "first");
    const deck = getDeck(state, "first");
    drawCard(hand, deck, "first");
    const card = hand.pop()!;
    expect(card.owner).toBe("first");
    deck.push(card);
    expect(deck[deck.length - 1]!.owner).toBe("first");
  });

  it("initReplayState assigns owner to every deck and opening-hand card", () => {
    resetGameState(42);
    initReplayState({ seed: 42, deckId: "standard", initialDraw: 4 });
    assertAllOwned("deck", "first");
    assertAllOwned("hand", "first");
    assertAllOwned("deck", "second");
    assertAllOwned("hand", "second");
  });
});

describe("Encroached World transform on deck-loaded hand cards", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 20260815, activePlayer: "first", roundCount: 4 })
      .withFirstPP(4, 4)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("Engage exact-copy transform works without owner on hand cards", () => {
    const firstDeck: RawDeck = {
      ordered: true,
      cards: [
        { name: "Marsh Wyrmling", count: 38 },
        { id: ENCROACHED, count: 1 },
        { name: "Scaled Lurker", count: 1 },
      ],
    };
    const secondDeck: RawDeck = {
      ordered: true,
      cards: [
        { name: "Mountain Behemoth", count: 39 },
        { name: "Primal Gorger", count: 1 },
      ],
    };

    resetGameState(20260815);
    loadPlayerDeckFromRaw("first", firstDeck, "enc_first.json", false);
    loadPlayerDeckFromRaw("second", secondDeck, "enc_second.json", false);
    state.players.first.pp = 4;
    state.players.first.maxPP = 4;
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";

    const firstHand = getHand(state, "first");
    const firstDeckCards = getDeck(state, "first");
    const enc = firstDeckCards.find((c) => c.id === ENCROACHED)!;
    const victim = firstDeckCards.find((c) => c.name === "Scaled Lurker")!;
    const keep = firstDeckCards.find((c) => c.name === "Marsh Wyrmling")!;
    firstHand.push(enc, victim, keep);
    state.players.first.deck = firstDeckCards.filter(
      (c) => c.uid !== enc.uid && c.uid !== victim.uid && c.uid !== keep.uid,
    );

    const secondDeckBefore = getDeck(state, "second").map((c) => ({
      uid: c.uid,
      name: c.name,
    }));
    const opponentNames = new Set(secondDeckBefore.map((c) => c.name));

    state.players.first.hand = [enc];
    whenPlayCard("first", 0);
    const amuletIdx = getBoard(state, "first").findIndex(
      (c) => c.id === ENCROACHED,
    );
    expect(amuletIdx).toBeGreaterThanOrEqual(0);

    state.players.first.hand = [keep, victim];
    engageAmulet("first", amuletIdx);
    expect(state.pendingTargetEffect).toBeTruthy();

    // Simulate pre-fix deck-loaded hand cards that never received owner.
    delete victim.owner;

    resolvePendingTarget(victim.uid);

    const handAfter = getHand(state, "first");
    const transformed = handAfter.find((c) => c.uid === victim.uid)!;
    expect(transformed).toBeTruthy();
    expect(opponentNames.has(transformed.name)).toBe(true);
    expect(transformed.owner).toBe("first");
    expect(getDeck(state, "second").map((c) => c.uid)).toEqual(
      secondDeckBefore.map((c) => c.uid),
    );
  });
});
