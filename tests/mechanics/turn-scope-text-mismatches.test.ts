/**
 * Turn-scope text mismatches fixed in the normalisation PR:
 * Dark Dimensions / Galleon (board bare vs "your turn") and Illamrita
 * (granted bare trigger — owner is the carrier).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { getBoard, getBanish } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("turn-scope text mismatches", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("Dark Dimensions (10603210) — EOT AoE fires only on owner's turn", () => {
    givenGameState({ seed: 11, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();

    const amulet = createCard("10603210", "board", "first");
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "first",
    );
    ally.peak_defense = 5;
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy.peak_defense = 5;
    state.players.first.board = [amulet, ally];
    state.players.second.board = [enemy];

    // Opponent's EOT must NOT resolve the AoE (pre-fix bare fired both sides).
    runEndOfTurnBoundary("second");
    expect(Number(ally.defense)).toBe(5);
    expect(Number(enemy.defense)).toBe(5);

    // Owner's EOT deals 2 once.
    runEndOfTurnBoundary("first");
    expect(Number(ally.defense)).toBe(3);
    expect(Number(enemy.defense)).toBe(3);
  });

  it("Galleon (10464110) — evolve-on-EOT fires only on owner's turn", () => {
    // roundCount >= 7 unlocks super-evolution for first (handleSuperEvoGate).
    givenGameState({ seed: 12, activePlayer: "first", roundCount: 8 })
      .withFirstPP(10, 10)
      .build();

    const galleon = createCard("10464110", "board", "first");
    galleon.peak_defense = galleon.defense;
    const ally = createCard(
      {
        name: "UnevolvedAlly",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 4,
      },
      "board",
      "first",
    );
    ally.peak_defense = 4;
    ally.hasEvolved = false;
    ally.isEvolved = false;
    ally.hasAttacked = false;
    state.players.first.board = [galleon, ally];
    state.players.second.board = [];

    // Opponent's EOT must not evolve (pre-fix bare evolved on both boundaries).
    runEndOfTurnBoundary("second");
    expect(!!ally.hasEvolved || !!ally.isEvolved).toBe(false);

    runEndOfTurnBoundary("first");
    expect(!!ally.hasEvolved || !!ally.isEvolved).toBe(true);
  });

  it("Illamrita grant (10704110) — banish trigger is carrier-owner scoped", () => {
    givenGameState({ seed: 13, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();

    const illamrita = createCard("10704110", "board", "first");
    const victim = createCard(
      { name: "Victim", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    victim.peak_defense = 5;
    victim.owner = "second";
    state.players.first.board = [illamrita];
    state.players.second.board = [victim];

    // Grant the authored trigger payload onto the opposing follower.
    const strike = (illamrita.triggers as any[]).find(
      (t) => t.event === "follower_strike",
    );
    const grant = strike.effects.find((e: any) => e.action === "grant_trigger");
    const granted = JSON.parse(JSON.stringify(grant.triggers[0]));
    expect(granted.condition?.whose_turn).toBe("owner");
    victim.triggers = [granted];

    // Illamrita's turn end must NOT banish the victim (bare used to).
    runEndOfTurnBoundary("first");
    expect(getBoard(state, "second").some((c) => c.uid === victim.uid)).toBe(
      true,
    );

    // Victim controller's turn end banishes.
    runEndOfTurnBoundary("second");
    expect(getBoard(state, "second").some((c) => c.uid === victim.uid)).toBe(
      false,
    );
    expect(getBanish(state, "second").some((c) => c.uid === victim.uid)).toBe(
      true,
    );
  });
});
