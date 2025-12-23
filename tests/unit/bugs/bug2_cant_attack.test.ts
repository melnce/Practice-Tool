import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../../src/logic/effects/ops/summon_ops/core.js";
import { attackFollower } from "../../../src/logic/core/combat.js";
import { applyKeywordsFromList } from "../../../src/logic/core/keywords.js";
import allCards from "../../../cards/all.json";

describe("Bug 2: cant_attack enforcement", () => {
  beforeEach(() => {
    resetGameState();
    state.isBlueTurn = true;
  });

  afterEach(() => {
    resetGameState();
  });

  it("Should prevent attack when cant_attack is active", () => {
    // Mock Goblin
    const goblinData = {
      id: "10001110",
      name: "Goblin",
      cost: 1,
      attack: 1,
      defense: 2,
      type: "Follower",
      class: "Neutral",
      rarity: "Bronze",
      tribes: [],
      keywords: [],
      set: "Basic",
    } as any;

    const attacker = makeCardFromDB(goblinData, "blue");
    pushToBoard(state.blueBoard, "blue", attacker);
    attacker.can_attack = true;
    attacker.attacks_left = 1;

    // Setup defender
    const defender = makeCardFromDB(goblinData, "red");
    pushToBoard(state.redBoard, "red", defender);

    // Apply cant_attack keyword manually
    attacker.keywords = [{ name: "cant_attack" } as any];
    applyKeywordsFromList(attacker);

    // Verify keyword state
    expect(attacker.keywordState?.cantAttack).toBe(true);

    const initialDefHealth = defender.defense;

    attackFollower(0, 0, "blue", "red");

    // Assert: Attack SHOULD fail (defense unchanged)
    // With previous code, it would succeed (defense reduced by 1)
    // With fix, it should fail.
    expect(defender.defense).toBe(initialDefHealth);
  });
});
