import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  applyLeaderDamage,
  handleModifyLeaderDamageReceived,
} from "../../src/logic/effects/leader.js";

describe("Beelzebub leader damage bonus", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  it("stores the damage bonus in state", () => {
    handleModifyLeaderDamageReceived({ amount: 1 } as any, "second");
    expect(state.players.second.leaderDamageTakenBonus).toBe(1);
    expect(state.players.first.leaderDamageTakenBonus).toBe(0);

    handleModifyLeaderDamageReceived({ amount: 1 } as any, "second");
    expect(state.players.second.leaderDamageTakenBonus).toBe(2);
  });

  it("applies the bonus when taking damage", () => {
    state.players.second.leaderDamageTakenBonus = 1;
    state.players.second.hp = 20;

    applyLeaderDamage("second", 2);
    expect(state.players.second.hp).toBe(17);

    applyLeaderDamage("second", 1);
    expect(state.players.second.hp).toBe(15);
  });

  // Owner ruling 2026-08-31: a 0-attack follower still produces a damage
  // *event* that deals 0, so +N makes it N. Healing (amount < 0) is not a
  // damage event and must not take the bonus.
  it("applies the bonus to a 0-damage event (owner ruling 2026-08-31)", () => {
    state.players.second.leaderDamageTakenBonus = 5;
    state.players.second.hp = 20;

    applyLeaderDamage("second", 0);
    expect(state.players.second.hp).toBe(15);
  });

  it("does not apply the bonus to healing", () => {
    state.players.second.leaderDamageTakenBonus = 5;
    state.players.second.hp = 20;

    applyLeaderDamage("second", -5);
    expect(state.players.second.hp).toBe(20);
  });

  it("respects resetGameState", () => {
    state.players.second.leaderDamageTakenBonus = 5;
    resetGameState(1);
    expect(state.players.second.leaderDamageTakenBonus).toBe(0);
  });
});
