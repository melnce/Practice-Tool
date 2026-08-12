import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { CardInstance, CardTemplate } from "../../src/core/types/index.js";
import { grantBarrier } from "../../src/logic/core/barrier.js";

describe("Bane vs Barrier Interaction", () => {
  beforeEach(() => {
    resetGameState(1);
    state.activePlayer = "first";
    state.activePlayer = "first"; // Source of truth for player turn
  });

  afterEach(() => {
    resetGameState(1);
  });

  const makeTestFollower = (
    owner: "first" | "second",
    name: string,
    stats: { attack: number; defense: number },
    traits: Partial<CardInstance> = {},
  ) => {
    const template: CardTemplate = {
      id: "test_" + name,
      uid: "temp_" + name,
      name,
      type: "Follower",
      cost: 1,
      attack: stats.attack,
      defense: stats.defense,
      format: "rotation",
      set_id: "0000",
      faction: "neutral",
      base_id: "0000",
    };
    const f = makeCardFromDB(template, owner);
    Object.assign(f, traits);
    const board =
      owner === "first"
        ? state.players.first.board
        : state.players.second.board;
    pushToBoard(board, owner, f);
    return f;
  };

  it("Barrier should block damage but NOT prevent Bane destruction", () => {
    // 1. Create Attacker with Bane (1/1)
    makeTestFollower("first", "Bane Attacker", { attack: 1, defense: 1 }, {
      hasBane: true,
      hasRush: true,
      can_attack: true,
      attacks_left: 1,
    } as any);

    // 2. Create Defender with Barrier (2/2)
    const defender = makeTestFollower("second", "Barrier Defender", {
      attack: 2,
      defense: 2,
    });
    grantBarrier(defender);

    expect(defender.hasBarrier).toBe(true);

    // 3. Attack
    // attackerIdx=0, defenderIdx=0
    attackFollower(0, 0, "first", "second");

    // 4. Assertions
    // Barrier should be popped
    expect(defender.hasBarrier).toBe(false);

    // Bane should destroy it.
    const defenderIsDead =
      (defender.defense as number) <= 0 ||
      !state.players.second.board.includes(defender);
    expect(defenderIsDead).toBe(true);
  });

  it("0-attack Bane still destroys through Barrier", () => {
    makeTestFollower("first", "Zero Bane", { attack: 0, defense: 5 }, {
      hasBane: true,
      hasRush: true,
      can_attack: true,
      attacks_left: 1,
    } as any);

    const defender = makeTestFollower("second", "Barrier Tank", {
      attack: 1,
      defense: 10,
    });
    grantBarrier(defender);
    expect(defender.hasBarrier).toBe(true);

    attackFollower(0, 0, "first", "second");

    expect(defender.hasBarrier).toBe(false);
    // 0 combat damage absorbed by Barrier still counts for Bane (§346 / §477)
    expect(
      (defender.defense as number) <= 0 ||
        !state.players.second.board.includes(defender),
    ).toBe(true);
  });
});
