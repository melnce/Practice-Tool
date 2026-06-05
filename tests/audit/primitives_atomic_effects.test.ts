/**
 * C4 — Atomic card effects defer death triggers until dispatch end (rulebook §307–317).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";

function lwVictim(name: string, summonName: string): CardInstance {
  const card = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 2 },
    "board",
    "second",
  );
  card.hasLastWords = true;
  const lw = [
    { op: "summon", source: "named", name: summonName, count: 1 } as any,
  ];
  card.keywordState = { lastWordsEffects: lw };
  card.lastWordsEffects = lw;
  return card;
}

describe("Rulebook §311 — Meteor: Last Words wait until the spell finishes", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.second.board = [lwVictim("MeteorVictim", "Bat")];
  });

  it("destroy then AoE: LW summon survives because it resolves after all spell ops", () => {
    runEffects(
      [
        {
          op: "destroy",
          target: "enemy:follower",
          distribution: "random",
          count: 1,
        },
        { op: "damage", target: "enemy:follower", amount: 3 },
      ] as any,
      "first",
      null,
    );

    const bat = getBoard(state, "second").find((c) => c.name === "Bat");
    expect(bat).toBeDefined();
    expect((bat as any).defense).toBeGreaterThan(0);
  });
});

describe("Rulebook §317 — simultaneous deaths: observer draws once per death", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
  });

  it("destroy 2 enemy followers → observer draws twice after spell resolves", () => {
    const observer = createCard(
      {
        name: "Observer",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "enemy_follower_leaves_field",
            source: "board",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [observer];
    state.players.second.board = [
      createCard(
        { name: "E1", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      ),
      createCard(
        { name: "E2", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      ),
    ];

    const handBefore = thenHand("first").length;
    runEffects(
      [
        {
          op: "destroy",
          target: "enemy:follower",
          distribution: "all",
          count: 2,
        },
      ] as any,
      "first",
      null,
    );

    expect(thenHand("first").length).toBe(handBefore + 2);
  });

  it("non-survivor observer in the same batch does not draw (§317)", () => {
    const doomedObserver = createCard(
      {
        name: "DoomedObserver",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "enemy_follower_leaves_field",
            source: "board",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    const other = createCard(
      { name: "E1", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    state.players.first.board = [doomedObserver];
    state.players.second.board = [other];

    const handBefore = thenHand("first").length;
    runEffects(
      [
        { op: "destroy", target: "enemy:follower", distribution: "all" },
        { op: "destroy", target: "ally:follower", distribution: "all" },
      ] as any,
      "first",
      null,
    );

    // Observer is not on the field when the deferred batch resolves — no draws.
    expect(thenHand("first").length).toBe(handBefore);
  });

  it("leaving card does not trigger its own leave listener (self-exclusion)", () => {
    const selfWatcher = createCard(
      {
        name: "SelfWatcher",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "enemy_follower_leaves_field",
            source: "board",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
      "board",
      "second",
    );
    state.players.second.board = [selfWatcher];

    const handBefore = thenHand("second").length;
    runEffects(
      [{ op: "destroy", target: "enemy:follower", distribution: "all" }] as any,
      "first",
      null,
    );

    expect(thenHand("second").length).toBe(handBefore);
  });
});
