/**
 * Batch 6 — Bleed keyword (Lymaga Super-Evolve pattern).
 * Each end of turn: damage to bearer's leader (to_leader) and bearer (to_self).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import { endTurnBlue } from "../../src/logic/core/turns.js";
import { getHP } from "../../src/core/playerHelpers.js";

describe("Foundations — Bleed keyword", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("EOT: bearer takes to_self and owner's leader takes to_leader", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();

    const bearer = createCard(
      { name: "Bleeder", type: "Follower", cost: 3, attack: 3, defense: 5 },
      "board",
      "second",
    );
    bearer.peak_defense = 5;
    state.players.second.board = [bearer];
    state.players.second.hp = 20;

    applyKeyword(bearer, "bleed", { to_leader: 1, to_self: 2 });

    endTurnBlue();
    expect(bearer.defense).toBe(3);
    expect(getHP(state, "second")).toBe(19);
  });
});
