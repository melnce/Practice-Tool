/**
 * Batch 4 — Rally primitives (rulebook §780).
 * Assertions from docs/svwb_rulebook_formatted.md only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { handleRallyGate } from "../../src/logic/effects/gates/gates.js";
import { getRally, setRally } from "../../src/core/playerHelpers.js";
import { evolveFollowerByEffect } from "../../src/logic/effects/ops/evolve.js";

import "../../src/logic/core/effects/index.js";

const R6 = 6;

describe("Rulebook §780 — Rally count", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("increments when a follower is played from hand", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10121110"])
      .withFirstPP(3, 6)
      .build();
    expect(getRally(state, "first")).toBe(0);
    whenPlayCard("first", 0);
    expect(getRally(state, "first")).toBe(1);
  });

  it("increments on named follower summon (Steelclad Knight Fanfare)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10121130"])
      .withFirstPP(3, 6)
      .build();
    whenPlayCard("first", 0);
    expect(getRally(state, "first")).toBe(2);
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(
      true,
    );
  });

  it("handleRallyGate fires at threshold and not below", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    setRally(state, "first", 4);
    const queue: any[] = [];
    handleRallyGate(
      "first",
      { count: 5, effects: [{ op: "draw", count: 1 }] },
      queue,
    );
    expect(queue.length).toBe(0);

    setRally(state, "first", 5);
    handleRallyGate(
      "first",
      { count: 5, effects: [{ op: "draw", count: 1 }] },
      queue,
    );
    expect(queue.length).toBe(1);
  });

  it("Fanfare Rally gate does not count the played card itself (§372 / §780 FAQ)", () => {
    // Gildaria (10224110): Fanfare gate condition:"rally" count:20 → super-evolve.
    // With rally 19 before play, Fanfare must see 19 (no super); counter reads 20 after.
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
      .withFirstHand(["10224110"])
      .withFirstPP(6, 7)
      .build();
    setRally(state, "first", 19);
    state.players.first.superEvoPoints = 1;

    whenPlayCard("first", 0);

    const gild = findOnBoard("first", "Gildaria, Anathema of Peace");
    expect(gild).toBeTruthy();
    expect(gild!.evoType).not.toBe("super");
    expect(gild!.hasEvolved).toBeFalsy();
    expect(getRally(state, "first")).toBe(20);
  });

  it("Fanfare Rally gate fires when threshold was already met before play", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
      .withFirstHand(["10224110"])
      .withFirstPP(6, 7)
      .build();
    setRally(state, "first", 20);
    state.players.first.superEvoPoints = 1;

    whenPlayCard("first", 0);

    const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
    expect(gild.evoType).toBe("super");
    // Self + 2 Steelclad Knights from evolve_trigger_always on super-evolve.
    expect(getRally(state, "first")).toBe(23);
  });
});

describe("Foundations — Gildaria evolve_trigger_always (10224110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("When this evolves: 2 Steelclad Knights with Rush (effect evolve + player EP)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstEvo(2)
      .build();
    const gild = createCard("10224110", "board", "first");
    gild.peak_defense = gild.defense;
    state.players.first.board = [gild];
    evolveFollowerByEffect(gild, "first");
    const knights = thenBoard("first").filter(
      (c) => c.name === "Steelclad Knight",
    );
    expect(knights.length).toBe(2);
    expect(knights.every((k) => k.hasRush)).toBe(true);

    resetUidCounter();
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 8 })
      .withFirstEvo(2)
      .build();
    const byEp = createCard("10224110", "board", "first");
    byEp.peak_defense = byEp.defense;
    state.players.first.board = [byEp];
    whenEvolve(byEp, "first");
    expect(
      thenBoard("first").filter((c) => c.name === "Steelclad Knight").length,
    ).toBe(2);
  });
});
