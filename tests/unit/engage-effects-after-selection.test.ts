/**
 * Engage effect lists must resume after a selection prompt (discard → tail).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getBoard,
  getGraveyard,
  getHand,
  getPP,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("Engage effect lists resume after selection", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(3, 6)
      .build();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("City of Babelon — discard then delay countdown by 1", () => {
    const handCard = createCard(
      { name: "Filler", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    const amulet = createCard("10703210", "board", "first");
    applyKeywordsFromList(amulet);
    amulet.countdown = 1;
    getBoard(state, "first").push(amulet);
    getHand(state, "first").push(handCard);

    const handUid = handCard.uid;
    engageAmulet("first", 0);
    expect(state.pendingTargetEffect).toBeTruthy();
    resolveFirstPending();

    expect(getGraveyard(state, "first").some((c) => c.uid === handUid)).toBe(
      true,
    );
    expect(amulet.countdown).toBe(2);
  });

  it("City of Babelon — empty hand fizzles discard but delay still happens", () => {
    const amulet = createCard("10703210", "board", "first");
    applyKeywordsFromList(amulet);
    amulet.countdown = 1;
    getBoard(state, "first").push(amulet);

    engageAmulet("first", 0);
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(amulet.countdown).toBe(2);
  });

  it("Darkhaven Grace — select follower then restore leader", () => {
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    getBoard(state, "first").push(ally);

    const grace = createCard("10162210", "board", "first");
    applyKeywordsFromList(grace);
    getBoard(state, "first").push(grace);
    state.players.first.hp = 18;

    const graceIdx = getBoard(state, "first").indexOf(grace);
    engageAmulet("first", graceIdx);
    resolveFirstPending();

    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(3);
    expect(getPP(state, "first")).toBe(2);
    expect(state.players.first.hp).toBe(19);
  });
});
