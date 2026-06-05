/**
 * C3 — Fanfare / enter-reactive order (rulebook §242–256).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.ts";
import { givenGameState, createCard, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { playFollower } from "../../src/logic/core/playCard/follower.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import "../../src/logic/core/effects/index.js";

describe("Rulebook §256 — Fanfare-granted Ward is not present at enter instant", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.board = [];
    state.players.first.crests = [
      {
        name: "Wilbert, Desolate Paladin",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            condition: { has_keyword: "Ward", not_self: true },
            effects: [
              {
                op: "stat",
                action: "give",
                target: "entering_follower",
                attack: 1,
                defense: 2,
              },
            ],
          },
        ],
      },
    ] as any;
  });

  it("Fanfare: grant Ward does not satisfy allied when-Ward-enters crest", () => {
    const card = createCard(
      {
        name: "Fanfare Ward",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        fanfare: [
          {
            op: "keyword",
            action: "grant",
            target: "self",
            keywords: ["Ward"],
          },
        ],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(card);
    card.peak_defense = card.defense;

    playFollower(card, "first", null);

    expect(card.hasWard).toBe(true);
    expect(card.attack).toBe(1);
    expect(card.defense).toBe(1);
  });
});
