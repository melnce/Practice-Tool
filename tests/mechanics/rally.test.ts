/**
 * @file Mechanic Contract Test: Rally count routes
 *
 * Bible: docs/svwb_rulebook_formatted.md — Rally + Owner ruling — Rally (2026-08-12).
 *
 * INVARIANTS:
 * - Rally increments iff a follower successfully enters your field
 * - Route is irrelevant (play, token, reanimate, invoke, deck, hand-copy, evolve-summon…)
 * - Failed summon (full field) does not increment
 * - Control change is not a summon → does not increment (secondary reading)
 * - Crystallize/Accelerate alternate plays: see crystallize_accelerate.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getRally, getBoard } from "../../src/core/playerHelpers.js";
import { handleReanimate } from "../../src/logic/effects/ops/reanimate.js";
import { handleInvoke } from "../../src/logic/effects/ops/summon_ops/invoke.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { summonExactCopyFromHand } from "../../src/logic/effects/ops/summon_ops/hand.js";
import { changeFollowerControl } from "../../src/logic/effects/ops/changeControl.js";
import { evolveFollowerByEffect } from "../../src/logic/effects/ops/evolve.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

describe("Owner ruling — Rally (2026-08-12): entry routes", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("play from hand increments Rally by 1", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10121110"])
      .withFirstPP(3, 6)
      .build();
    expect(getRally(state, "first")).toBe(0);
    whenPlayCard("first", 0);
    expect(getRally(state, "first")).toBe(1);
  });

  it("named token summon increments Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    expect(getRally(state, "first")).toBe(0);
    summonNamed(
      { op: "summon", name: "Steelclad Knight", count: 1 } as any,
      "first",
    );
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(
      true,
    );
    expect(getRally(state, "first")).toBe(1);
  });

  it("reanimate increments Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.graveyard = [
      createCard("10001110", "graveyard", "first"),
    ];
    expect(getRally(state, "first")).toBe(0);
    handleReanimate({ op: "reanimate", max_cost: 2 } as any, "first");
    expect(getBoard(state, "first")).toHaveLength(1);
    expect(getRally(state, "first")).toBe(1);
  });

  it("invoke from deck increments Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const card = createCard("10121110", "deck", "first");
    state.players.first.deck = [card];
    expect(getRally(state, "first")).toBe(0);
    expect(handleInvoke("first", card)).toBe(true);
    expect(getBoard(state, "first").some((c) => c.uid === card.uid)).toBe(true);
    expect(getRally(state, "first")).toBe(1);
  });

  it("summon from deck increments Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.deck = [
      createCard("10121110", "deck", "first"),
      createCard("10001110", "deck", "first"),
    ];
    expect(getRally(state, "first")).toBe(0);
    whenRunEffects(
      [
        {
          op: "summon",
          source: "deck",
          count: 1,
          filter: { type: "Follower" },
        } as any,
      ],
      "first",
    );
    expect(getBoard(state, "first").length).toBe(1);
    expect(getRally(state, "first")).toBe(1);
  });

  it("exact copy from hand increments Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const src = createCard("10121110", "hand", "first");
    state.players.first.hand = [src];
    expect(getRally(state, "first")).toBe(0);
    const copy = summonExactCopyFromHand(src, "first");
    expect(copy).toBeTruthy();
    expect(getBoard(state, "first")).toHaveLength(1);
    expect(getRally(state, "first")).toBe(1);
  });

  it("evolve-summons (Gildaria When this evolves) increment Rally per token", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstEvo(2)
      .build();
    const gild = createCard("10224110", "board", "first");
    gild.peak_defense = gild.defense;
    state.players.first.board = [gild];
    // Gildaria is already on board without going through play — seed Rally at 0.
    expect(getRally(state, "first")).toBe(0);
    evolveFollowerByEffect(gild, "first");
    const knights = thenBoard("first").filter(
      (c) => c.name === "Steelclad Knight",
    );
    expect(knights.length).toBe(2);
    expect(getRally(state, "first")).toBe(2);
  });

  it("enemy-side named summon increments the enemy's Rally, not yours", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    whenRunEffects(
      [
        {
          op: "summon",
          source: "named",
          name: "Steelclad Knight",
          count: 1,
          owner: "enemy",
        } as any,
      ],
      "first",
    );
    expect(
      getBoard(state, "second").some((c) => c.name === "Steelclad Knight"),
    ).toBe(true);
    expect(getRally(state, "first")).toBe(0);
    expect(getRally(state, "second")).toBe(1);
  });
});

describe("Owner ruling — Rally (2026-08-12): negative cases", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("full-field failed summon does not increment Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.board = Array.from({ length: 5 }, (_, i) => {
      const c = createCard("10001110", "board", "first");
      c.uid = `fill-${i}`;
      return c;
    });
    // Board was seeded without play — Rally still 0
    expect(getRally(state, "first")).toBe(0);
    summonNamed(
      { op: "summon", name: "Steelclad Knight", count: 1 } as any,
      "first",
    );
    expect(getBoard(state, "first")).toHaveLength(5);
    expect(
      getBoard(state, "first").some((c) => c.name === "Steelclad Knight"),
    ).toBe(false);
    expect(getRally(state, "first")).toBe(0);
  });

  it("partial multi-summon: only successful slots increment Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.board = Array.from({ length: 4 }, (_, i) => {
      const c = createCard("10001110", "board", "first");
      c.uid = `fill-${i}`;
      return c;
    });
    expect(getRally(state, "first")).toBe(0);
    summonNamed(
      { op: "summon", name: "Steelclad Knight", count: 3 } as any,
      "first",
    );
    expect(
      getBoard(state, "first").filter((c) => c.name === "Steelclad Knight")
        .length,
    ).toBe(1);
    expect(getRally(state, "first")).toBe(1);
  });

  it("control change does not increment Rally (secondary reading)", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const enemy = createCard("10121110", "board", "second");
    state.players.second.board = [enemy];
    expect(getRally(state, "first")).toBe(0);
    expect(getRally(state, "second")).toBe(0);

    expect(changeFollowerControl(enemy, "first")).toBe(true);
    expect(getBoard(state, "first")).toHaveLength(1);
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(enemy.owner).toBe("first");
    // Neither side gains Rally — control change is not a summon
    expect(getRally(state, "first")).toBe(0);
    expect(getRally(state, "second")).toBe(0);
  });

  it("playing an amulet from hand does not increment Rally", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10001210"]) // Detective's Lens (amulet)
      .withFirstPP(2, 6)
      .build();
    expect(getRally(state, "first")).toBe(0);
    whenPlayCard("first", 0);
    expect(getBoard(state, "first")[0]?.type).toBe("Amulet");
    expect(getRally(state, "first")).toBe(0);
  });
});
