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
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { createCard } from "../harness/builders.js";
import "../../src/logic/core/effects/index.js";

const EARRINGS = "10761210";
const RETURN_CARD = "10001110";
const DRAW_TOP = "10021110";
const FILLER = "10102110";
const BUG_ALERT = "10012310";
const ADVENTURERS_GUILD = "10002210";
const MANAMEL = "10411120";

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

function ephemeralFlagged(): string[] {
  const hits: string[] = [];
  const last = (state as any).__lastSelected as CardInstance | undefined;
  const lah = (state as any).lastAddedToHand as CardInstance | undefined;
  if (last?.__uiSelectable) hits.push(`__lastSelected:${last.uid}`);
  if (lah?.__uiSelectable) hits.push(`lastAddedToHand:${lah.uid}`);
  return hits;
}

function assertNoSelectableFlags() {
  expect(flaggedAnywhere()).toEqual([]);
  expect(ephemeralFlagged()).toEqual([]);
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

  it("clearSelectableFlags clears __uiSelectable on __lastSelected and lastAddedToHand", () => {
    givenGameState({ seed: 1 }).build();
    const grave = createCard(FILLER, "graveyard", "first");
    const hand = createCard(DRAW_TOP, "hand", "first");
    grave.__uiSelectable = true;
    hand.__uiSelectable = true;
    (state as any).__lastSelected = grave;
    (state as any).lastAddedToHand = hand;

    clearSelectableFlags();

    expect(grave.__uiSelectable).toBeUndefined();
    expect(hand.__uiSelectable).toBeUndefined();
    expect((state as any).__lastSelected?.__uiSelectable).toBeUndefined();
    expect((state as any).lastAddedToHand?.__uiSelectable).toBeUndefined();
  });

  it("Bug Alert (10012310) return-to-hand: __lastSelected is not flagged after resolve", () => {
    givenGameState({ seed: 3, activePlayer: "first" })
      .withFirstHand([BUG_ALERT])
      .withFirstPP(10, 10)
      .build();

    const ally = createCard("10001110", "board", "first");
    ally.uid = "ally_return";
    state.players.first.board = [ally];
    state.players.second.board = [
      createCard(
        { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "second",
      ),
    ];

    whenPlayCard("first", 0);
    resolvePendingTarget("ally_return");

    assertNoSelectableFlags();
  });

  it("Adventurer's Guild Engage: lastAddedToHand is not flagged after target resolve", () => {
    givenGameState({ seed: 4, activePlayer: "first", roundCount: 5 })
      .withFirstDeck([
        {
          name: "Deck Follower",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
      ])
      .withFirstPP(10, 10)
      .build();

    const guild = createCard(ADVENTURERS_GUILD, "board", "first");
    guild.hasEngage = true;
    guild.engageCost = 1;
    guild.engageEffects = guild.keywords?.find(
      (k: any) => k.name === "Engage",
    )?.effects;
    guild.peak_defense = guild.defense;
    const rushTarget = createCard("10001110", "board", "first");
    rushTarget.peak_defense = rushTarget.defense;
    state.players.first.board = [guild, rushTarget];
    (state as any).lastAddedToHand = createCard(DRAW_TOP, "hand", "first");
    (state as any).lastAddedToHand.__uiSelectable = true;

    engageAmulet("first", 0);
    expect(state.pendingTargetEffect).toBeDefined();
    resolvePendingTarget(rushTarget.uid);

    assertNoSelectableFlags();
  });

  it("Manamel bounce: END_TURN does not evolve from stale trigger cache", () => {
    givenGameState({ seed: 5, activePlayer: "second", roundCount: 6 })
      .withSecondHand([BUG_ALERT])
      .withSecondPP(10, 10)
      .build();
    state.players.second.evoCount = 1;

    const manamel = createCard(MANAMEL, "board", "second");
    manamel.peak_defense = manamel.defense;
    manamel.justPlayed = false;
    manamel.uid = "manamel_board";
    state.players.second.board = [manamel];
    state.players.first.board = [
      createCard(
        { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "first",
      ),
    ];

    whenPlayCard("second", 0);
    resolvePendingTarget("manamel_board");

    const evoBefore = state.players.second.evoCount;
    engineDispatch(state, { type: "END_TURN" });
    expect(state.players.second.evoCount).toBe(evoBefore);
  });
});
