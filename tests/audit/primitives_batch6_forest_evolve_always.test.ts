/**
 * Batch 6 — Forestcraft `evolve_trigger_always` (Cupitan, Manamel).
 * Card text "When this follower evolves" must run on effect-granted evolve, not only player EP.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { evolveFollowerByEffect } from "../../src/logic/effects/ops/evolve.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import "../../src/logic/core/effects/index.js";

describe("Foundations — Manamel & Cupitan evolve_trigger_always", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Manamel — EOT effect-evolve runs When this evolves (1 damage all enemy followers)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();

    const manamel = createCard("10411120", "board", "first");
    manamel.peak_defense = manamel.defense;
    manamel.justPlayed = false;
    expect(manamel.evolve_trigger_always).toBe(true);

    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 3 },
      "board",
      "second",
    );
    enemy.peak_defense = 3;
    state.players.second.board = [enemy];
    state.players.first.board = [manamel];

    const eot = (manamel.triggers ?? []).find(
      (t: { type?: string; event?: string }) =>
        t.event === "end_of_turn" || t.type === "end_of_turn_own",
    );
    runEffects((eot as { effects: unknown[] }).effects, "first", manamel);

    expect(manamel.hasEvolved).toBe(true);
    expect(enemy.defense).toBe(2);
  });

  it("Manamel — player EP evolve also runs full evolve script", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstEvo(2)
      .withFirstPP(10, 10)
      .build();

    const manamel = createCard("10411120", "board", "first");
    manamel.peak_defense = manamel.defense;
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 3 },
      "board",
      "second",
    );
    enemy.peak_defense = 3;
    state.players.second.board = [enemy];
    state.players.first.board = [manamel];

    whenEvolve(manamel, "first");
    expect(enemy.defense).toBe(2);
  });

  it("Cupitan — Skybound effect-evolve runs 7×1 random follower damage", () => {
    expect(createCard("10413110", "hand", "first").evolve_trigger_always).toBe(
      true,
    );

    const e1 = createCard(
      { name: "E1", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    e1.peak_defense = 5;
    const e2 = createCard(
      { name: "E2", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    e2.peak_defense = 5;
    state.players.second.board = [e1, e2];

    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstHand(["10413110"])
      .withFirstPP(10, 10)
      .build();
    for (let i = 0; i < 10; i++) incrementSkyboundArt("first");
    const handCup = state.players.first.hand[0]!;
    handCup.skyboundArtEvolvesWitnessed = 10;
    whenPlayCard("first", 0);

    const onBoard = findOnBoard("first", "Cupitan, Iridescent Archer")!;
    expect(onBoard.hasEvolved).toBe(true);
    const totalDef = state.players.second.board.reduce(
      (s, c) => s + Number(c.defense),
      0,
    );
    expect(totalDef).toBeLessThan(10);
  });

  it("Cupitan — effect evolve via evolveFollowerByEffect runs evolve script", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstEvo(2)
      .build();

    const cupitan = createCard("10413110", "board", "first");
    cupitan.peak_defense = cupitan.defense;
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 7 },
      "board",
      "second",
    );
    enemy.peak_defense = 7;
    state.players.second.board = [enemy];
    state.players.first.board = [cupitan];

    evolveFollowerByEffect(cupitan, "first");
    expect(cupitan.hasEvolved).toBe(true);
    expect(enemy.defense).toBeLessThan(7);
  });
});
