/**
 * BanishOnDeath (Ghost 90051130): banish-on-death must fire leave-field triggers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getBanish, getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const GHOST = "90051130";

describe("BanishOnDeath — leave-field triggers", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstDeck([
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
  });

  it("ally_follower_leaves_field fires when Ghost is banished on death", () => {
    const observer = createCard(
      {
        name: "Observer",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_follower_leaves_field",
            source: "board",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    const ghost = createCard(GHOST, "board", "first");
    if (Array.isArray(ghost.keywords)) {
      applyKeywordsFromList(ghost);
    }
    ghost.defense = 0;
    state.players.first.board = [observer, ghost];

    const handBefore = getHand(state, "first").length;
    cleanupDead();

    expect(getBanish(state, "first").some((c) => c.uid === ghost.uid)).toBe(
      true,
    );
    expect(getHand(state, "first").length).toBe(handBefore + 1);
  });
});
