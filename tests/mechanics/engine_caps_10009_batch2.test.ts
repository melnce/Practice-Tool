/**
 * Engine capabilities for set 10009 (batch 2): cost ladder, hand_class_count,
 * exclude_selected random damage, deck destroyed_match highest base cost.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  resetUidCounter,
  createCard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { recordPlayedBaseCost } from "../../src/logic/core/playedBaseCostHistory.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { handleDeck } from "../../src/logic/effects/deck.js";
import { getDeck } from "../../src/core/playerHelpers.js";

describe("played_base_cost_ladder", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 7 }).build();
    state.gameStarted = true;
  });

  it("gate passes when costs 1–8 have all been played", () => {
    for (let c = 1; c <= 8; c++) recordPlayedBaseCost(state, "first", c);

    const effect = {
      op: "gate" as const,
      condition: "played_base_cost_ladder",
      effects: [{ op: "damage" as const, target: "enemy:leader", amount: 2 }],
    };
    const hpBefore = state.players.second.hp;
    whenRunEffects([effect], "first");
    expect(state.players.second.hp).toBe(hpBefore - 2);
  });

  it("gate fails when ladder is incomplete", () => {
    for (let c = 1; c <= 7; c++) recordPlayedBaseCost(state, "first", c);

    const effect = {
      op: "gate" as const,
      condition: "played_base_cost_ladder",
      effects: [{ op: "damage" as const, target: "enemy:leader", amount: 2 }],
    };
    const hpBefore = state.players.second.hp;
    whenRunEffects([effect], "first");
    expect(state.players.second.hp).toBe(hpBefore);
  });
});

describe("hand_class_count amount_source", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 3 })
      .withSecondBoard([
        { name: "A", type: "Follower", attack: 1, defense: 5 },
        { name: "B", type: "Follower", attack: 1, defense: 5 },
      ])
      .build();
    state.players.first.hand = [
      createCard(
        { name: "N1", type: "Follower", class: "Neutral", cost: 1 },
        "hand",
        "first",
      ),
      createCard(
        { name: "N2", type: "Spell", class: "Neutral", cost: 1 },
        "hand",
        "first",
      ),
      createCard(
        { name: "D1", type: "Follower", class: "Dragoncraft", cost: 2 },
        "hand",
        "first",
      ),
    ];
  });

  it("deals damage equal to Neutral cards in hand", () => {
    const effect = {
      op: "damage" as const,
      target: "enemy:follower",
      amount_source: "hand_class_count",
      class: "Neutral",
      distribution: "random_hits" as const,
      count: 1,
    };
    whenRunEffects([effect], "first");
    const damaged = ["A", "B"]
      .map((n) => findOnBoard("second", n)?.defense)
      .filter((d) => d !== 5);
    expect(damaged.length).toBe(1);
    expect(damaged[0]).toBe(3);
  });
});

describe("exclude_selected random damage", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 11 })
      .withSecondBoard([
        { name: "Primary", type: "Follower", attack: 1, defense: 10 },
        { name: "Splash", type: "Follower", attack: 1, defense: 10 },
      ])
      .build();
    (state as any).__lastSelected = findOnBoard("second", "Primary");
  });

  it("random hit skips the selected follower when exclude_selected is set", () => {
    const effect = {
      op: "damage" as const,
      target: "enemy:follower",
      amount: 2,
      distribution: "random_hits" as const,
      count: 1,
      exclude_selected: true,
    };
    whenRunEffects([effect], "first");
    expect(findOnBoard("second", "Primary")!.defense).toBe(10);
    expect(findOnBoard("second", "Splash")!.defense).toBe(8);
  });
});

describe("deck add destroyed_match highest base_cost", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 5 }).build();
    state.gameStarted = true;
  });

  it("adds a copy of the highest-base-cost destroyed allied follower", () => {
    const cheap = createCard("10001110", "board", "first");
    const pricey = createCard("10002120", "board", "first");
    recordDestroyed(state, "first", cheap);
    recordDestroyed(state, "first", pricey);

    handleDeck(
      {
        op: "deck",
        action: "add",
        source: "destroyed_match",
        rank: "highest",
        stat: "base_cost",
        filter: { type: "Follower" },
        count: 1,
        shuffle: false,
      },
      "first",
    );

    const deck = getDeck(state, "first");
    expect(deck.some((c) => c.name === pricey.name)).toBe(true);
    expect(deck.filter((c) => c.name === cheap.name).length).toBe(0);
  });
});
