/**
 * Batch 7 — Edelweiss (10133130): final cross-class check for evolve_trigger_always.
 * Earth Rite Fanfare effect-evolve must run "When this follower evolves" (not EP-only Evolve:).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getPP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("Edelweiss — evolve_trigger_always on effect-evolve", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("card data marks evolve_trigger_always; evolve[] is When-this-evolves script", () => {
    const ed = createCard("10133130", "hand", "first");
    expect(ed.evolve_trigger_always).toBe(true);
    expect(ed.evolve?.some((e: { op?: string }) => e.op === "damage")).toBe(
      true,
    );
    expect(ed.evolve?.some((e: { op?: string }) => e.op === "pp")).toBe(true);
  });

  it("Fanfare Earth Rite (2) evolves Edelweiss and runs 4 damage + 2 PP recover", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10133130"])
      .withFirstPP(4, 6)
      .build();
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy.peak_defense = 5;
    state.players.second.board = [enemy];
    state.players.first.board = [
      createCard(
        { name: "Sediment", type: "Amulet", cost: 1 },
        "board",
        "first",
      ),
    ];
    const sigil = state.players.first.board[0]!;
    sigil.counters = { earth: 2 };

    whenPlayCard("first", 0);

    const ed = state.players.first.board.find((c) =>
      c.name?.includes("Edelweiss"),
    );
    expect(ed?.hasEvolved).toBe(true);
    expect(enemy.defense).toBe(1);
    // Paid 4 PP for a 4-cost card, then recover 2 (not restore to pre-play total)
    expect(getPP(state, "first")).toBe(2);
  });
});
