/**
 * Leader-target Vulnerable keyword writes leaderDamageTakenBonus (not legacy root keys).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { handleKeyword } from "../../src/logic/effects/ops/keyword/unified.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";

describe("leader Vulnerable keyword op", () => {
  beforeEach(() => {
    resetGameState(1);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.hp = 20;
    state.players.second.hp = 20;
  });

  it("enemy:leader grants Vulnerable to the opponent leader", () => {
    handleKeyword(
      {
        op: "keyword",
        action: "grant",
        target: "enemy:leader",
        keywords: [{ name: "Vulnerable", value: 1 }],
      } as any,
      { owner: "first", sourceCard: null, targets: [], effectsQueue: [] },
    );
    expect(state.players.second.leaderDamageTakenBonus).toBe(1);
    expect(state.players.first.leaderDamageTakenBonus).toBe(0);
    const hpBefore = state.players.second.hp;
    applyLeaderDamage("second", 1);
    expect(state.players.second.hp).toBe(hpBefore - 2);
  });

  it("ally:leader grants Vulnerable to the acting player leader", () => {
    handleKeyword(
      {
        op: "keyword",
        action: "grant",
        target: "ally:leader",
        keywords: [{ name: "Vulnerable", value: 1 }],
      } as any,
      { owner: "first", sourceCard: null, targets: [], effectsQueue: [] },
    );
    expect(state.players.first.leaderDamageTakenBonus).toBe(1);
    expect(state.players.second.leaderDamageTakenBonus).toBe(0);
    const hpBefore = state.players.first.hp;
    applyLeaderDamage("first", 1);
    expect(state.players.first.hp).toBe(hpBefore - 2);
  });

  it("stacking two grants adds +2 to leaderDamageTakenBonus", () => {
    const eff = {
      op: "keyword",
      action: "grant",
      target: "enemy:leader",
      keywords: [{ name: "Vulnerable", value: 1 }],
    } as any;
    const ctx = {
      owner: "first" as const,
      sourceCard: null,
      targets: [],
      effectsQueue: [],
    };
    handleKeyword(eff, ctx);
    handleKeyword(eff, ctx);
    expect(state.players.second.leaderDamageTakenBonus).toBe(2);
    const hpBefore = state.players.second.hp;
    applyLeaderDamage("second", 1);
    expect(state.players.second.hp).toBe(hpBefore - 3);
  });

  it("resetGameState clears leaderDamageTakenBonus", () => {
    handleKeyword(
      {
        op: "keyword",
        action: "grant",
        target: "enemy:leader",
        keywords: [{ name: "Vulnerable", value: 1 }],
      } as any,
      { owner: "first", sourceCard: null, targets: [], effectsQueue: [] },
    );
    expect(state.players.second.leaderDamageTakenBonus).toBe(1);
    resetGameState(2);
    expect(state.players.second.leaderDamageTakenBonus).toBe(0);
    expect(state.players.first.leaderDamageTakenBonus).toBe(0);
  });
});
