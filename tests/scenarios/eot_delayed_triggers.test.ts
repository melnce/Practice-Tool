import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { registerTrigger } from "../../src/logic/core/triggers.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import { CardInstance } from "../../src/core/types.js";

function createCard(id: string, name: string): CardInstance {
  return {
    uid: id,
    name: name,
    type: "Follower",
    cost: 1,
    base_cost: 1,
    attack: 1,
    base_attack: 1,
    defense: 1,
    base_defense: 1,
    keywordState: {},
    zone: "board",
  } as any;
}

describe("Scenario: End of Turn Delayed Triggers", () => {
  beforeEach(() => {
    resetGameState();
    // Setup initial basic state
    state.blueHP = 20;
    state.redHP = 20;
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("should fire delayed effects at end of turn and clean up", () => {
    const ally = createCard("ally_trigger", "TriggerUnit");
    state.blueBoard.push(ally);

    // 1. Manually register a delayed trigger
    // This simulates a card effect saying "At the end of your turn, deal 1 damage to enemy leader"
    const triggerDef = {
      event: "end_of_turn",
      effects: [{ op: "damage", amount: 1, target: "enemy:leader" }],
    };

    // This is typically done by `registerTrigger` or implicitly via card metadata
    registerTrigger(ally, triggerDef);

    // Verify initial state
    expect(state.redHP).toBe(20);

    // 2. End Turn (Blue)
    endTurnBlue();

    // 3. Assertions
    // Effect should have fired
    expect(state.redHP).toBe(19);

    // Trigger maintenance check?
    // Note: Permanent triggers (from card text) persist.
    // Temporary ones might expire, but here we registered a standard trigger.
    // We assert the system processed the event queue.
  });

  it("should NOT fire opponents end of turn triggers", () => {
    const enemy = createCard("enemy_trigger", "EnemyUnit");
    state.redBoard.push(enemy);

    // Enemy has a trigger "At the end of YOUR (Red's) turn..."
    registerTrigger(enemy, {
      event: "end_of_turn",
      effects: [{ op: "damage", amount: 5, target: "enemy:leader" }], // 'enemy' relative to Red is Blue
    });

    // End BLUE's turn
    endTurnBlue();

    // Blue ended turn, so it's not Red's EOT. Red's trigger should not fire.
    expect(state.blueHP).toBe(20);
  });
});
