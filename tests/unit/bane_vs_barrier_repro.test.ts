import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { CardInstance, CardTemplate } from "../../src/core/types.js";
import { grantBarrier } from "../../src/logic/core/barrier.js";

describe("Bane vs Barrier Interaction", () => {
  beforeEach(() => {
    resetGameState();
    state.isBlueTurn = true;
    // mock active player getter if needed, but logic seems to use state.isBlueTurn
  });

  afterEach(() => {
    resetGameState();
  });

  const makeTestFollower = (
    owner: "blue" | "red",
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
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    pushToBoard(board, owner, f);
    return f;
  };

  it("Barrier should block damage but NOT prevent Bane destruction", () => {
    // 1. Create Attacker with Bane (1/1)
    const attacker = makeTestFollower(
      "blue",
      "Bane Attacker",
      { attack: 1, defense: 1 },
      {
        hasBane: true,
        hasRush: true,
        can_attack: true,
        attacks_left: 1,
      } as any,
    );

    // 2. Create Defender with Barrier (2/2)
    const defender = makeTestFollower("red", "Barrier Defender", {
      attack: 2,
      defense: 2,
    });
    grantBarrier(defender);

    expect(defender.hasBarrier).toBe(true);

    // 3. Attack
    // attackerIdx=0, defenderIdx=0
    attackFollower(0, 0, "blue", "red");

    // 4. Assertions
    // Barrier should be popped
    expect(defender.hasBarrier).toBe(false);

    // Bane should destroy it.
    const defenderIsDead =
      (defender.defense as number) <= 0 || !state.redBoard.includes(defender);
    expect(defenderIsDead).toBe(true);
  });
});
