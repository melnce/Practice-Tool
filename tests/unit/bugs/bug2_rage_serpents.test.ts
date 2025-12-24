import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState";
import { playCard } from "../../../src/logic/core/playCard";
import { resolvePendingTarget } from "../../../src/logic/core/resolveTarget";
import { CardInstance } from "../../../src/core/types";
import { loadCardDatabase } from "../../../src/data/cardDatabase";

const makeUid = () => "test_uid_" + Math.random().toString(36).slice(2);

describe("Bug 2: Rage of Serpents Selection State", () => {
  beforeAll(async () => {
    await loadCardDatabase();
  });

  beforeEach(() => {
    resetGameState(1);
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
    state.isFirstPlayerTurn = true;
    // Ensure leaders have HP
    state.players.first.hp = 20;
    state.players.second.hp = 20;
  });

  it("should deal damage to target follower AND self leader, then clear pending state", () => {
    // Rage of Serpents: Deal 3 to enemy follower/leader, then deal 2 to self leader.
    const rage: CardInstance = {
      id: "10153310", // Real ID from JSON
      uid: makeUid(),
      name: "Rage of Serpents",
      type: "Spell",
      cost: 2,
      owner: "first",
      class: "Abysscraft",
      spell: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 3,
          select: 1,
          fallback_leader: true,
        } as any,
        {
          op: "damage",
          target: "ally:leader",
          amount: 2,
        },
      ],
    };

    const enemyFollower: CardInstance = {
      id: "90000001",
      uid: makeUid(),
      name: "Enemy Follower",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 3, // Will die from 3 damage
      owner: "second",
      zone: "board",
    };
    state.players.second.board = [enemyFollower];

    state.players.first.hand = [rage];

    // 1. Play Card -> Should Pause
    const outcome = playCard(state.players.first.hand, "first", 0);
    expect(outcome.kind).toBe("paused");
    const pending = state.pendingTargetEffect;
    expect(pending).toBeDefined();
    expect(pending?.eff.op).toBe("damage");
    expect(pending?.resumeEffects).toHaveLength(1); // The self-damage effect

    // 2. Resolve on Enemy Follower
    resolvePendingTarget(enemyFollower.uid);

    // 3. Verify Damage & Death
    // Follower had 3 Def, took 3 Dmg -> Dead
    expect(state.players.second.graveyard).toContain(enemyFollower);

    // 4. Verify Resume Effect (Self Damage)
    expect(state.players.first.hp).toBe(18); // 20 - 2 = 18

    // 5. Verify State Pickup
    expect(state.pendingTargetEffect).toBeUndefined();

    // BUG REPRO: Ensure selection ticking state (UI flags) is fully cleared
    // The bug report "selection stuck / invalid ticking" implies __uiSelectable might be lingering.
    expect((enemyFollower as any).__uiSelectable).toBeUndefined();
  });

  it("should deal damage to enemy leader AND self leader", () => {
    const rage: CardInstance = {
      id: "10153310",
      uid: makeUid(),
      name: "Rage of Serpents",
      type: "Spell",
      cost: 2,
      owner: "first",
      class: "Abysscraft",
      spell: [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 3,
          select: 1,
          fallback_leader: true,
        } as any,
        {
          op: "damage",
          target: "ally:leader",
          amount: 2,
        },
      ],
    };

    const enemyFollower: CardInstance = {
      id: "90000001",
      uid: makeUid(),
      name: "Enemy Follower",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 5,
      owner: "second",
      zone: "board",
    };
    state.players.second.board = [enemyFollower];

    state.players.first.hand = [rage];

    // 1. Play
    playCard(state.players.first.hand, "first", 0);
    expect(state.pendingTargetEffect).toBeDefined();

    // 2. Resolve on Leader
    resolvePendingTarget("leader"); // Target enemy leader

    // 3. Verify Enemy Leader Damage
    expect(state.players.second.hp).toBe(17); // 20 - 3 = 17

    // 4. Verify Self Damage
    expect(state.players.first.hp).toBe(18); // 20 - 2 = 18

    expect(state.pendingTargetEffect).toBeUndefined();

    // BUG REPRO: Ensure followers stop ticking even when Leader was the target
    expect((enemyFollower as any).__uiSelectable).toBeUndefined();
  });
});






