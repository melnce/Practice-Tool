import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import { CardInstance, Effect } from "../../src/core/types.js";

// Helper to create a dummy card
function createCard(id: string, name: string): CardInstance {
  return {
    uid: id,
    name: name,
    type: "Follower",
    cost: 1,
    base_cost: 1,
    attack: 1,
    defense: 1,
    base_attack: 1,
    base_defense: 1,
    keywordState: {},
    zone: "board",
  } as any;
}

describe("Scenario: Selection Resolution", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("should clear pendingSelection after a valid selection is made", () => {
    const ally = createCard("ally_1", "Ally");
    const enemy = createCard("enemy_1", "Enemy");
    state.players.first.board.push(ally);
    state.players.second.board.push(enemy);

    // 1. Trigger an effect that requires selection
    const effect: Effect = {
      op: "damage",
      amount: 1,
      target: "enemy:follower",
      select: 1,
    };

    // 2. Mock the selection context provided by the UI/AI
    const context = {
      targets: [enemy],
    };

    // 3. Run the effect
    // The engine's `handleSelect` logic typically consumes the context.targets immediately if present
    const result = runEffects([effect], "first", ally, context);

    // 4. Verification
    // Ops result: "done" means it executed successfully
    expect(result).toBe("done");

    // State verification
    expect(enemy.defense).toBe(0); // Damage applied (1 - 1 = 0)
    expect(state.pendingSelection).toBeNull(); // Pending state must be clear
  });

  it("should set pendingSelection if no targets provided for a select ops", () => {
    const ally = createCard("ally_1", "Ally");
    const enemy = createCard("enemy_1", "Enemy");
    state.players.first.board.push(ally);
    state.players.second.board.push(enemy);

    const effect: Effect = {
      op: "damage",
      amount: 1,
      target: "enemy:follower",
      select: 1,
    };

    // No context provided (undefined targets)
    const result = runEffects([effect], "first", ally);

    expect(result).toBe("pending");
    expect(state.pendingSelection).not.toBeNull();
    expect(state.pendingSelection?.op).toBe("damage");
  });
});






