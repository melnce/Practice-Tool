/**
 * Crest countdown scope: ally:crest / enemy:crest target all crests with finite countdown.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { handleCountdown } from "../../src/logic/effects/ops/countdown/unified.js";
import { getCrests, getHP } from "../../src/core/playerHelpers.js";

describe("crest countdown scope (ally:crest / enemy:crest)", () => {
  beforeEach(() => {
    resetGameState(1);
    state.phase = "main";
    state.activePlayer = "first";
    state.players.second.hp = 20;
  });

  it("advance with target ally:crest completes a crest at countdown 0 (Last Words once)", () => {
    state.players.first.crests = [
      {
        name: "Crest: Belial (scope test)",
        owner: "first",
        countdown: 1,
        keywords: ["LastWords"],
        effects: [{ op: "damage", target: "enemy:leader", amount: 20 }],
      } as any,
      {
        name: "Other Crest",
        owner: "first",
        countdown: 3,
      } as any,
    ];

    handleCountdown(
      {
        op: "countdown",
        action: "advance",
        target: "ally:crest",
        amount: 1,
      } as any,
      { owner: "first" },
    );

    expect(getCrests(state, "first")).toHaveLength(1);
    expect(getCrests(state, "first")[0]!.name).toBe("Other Crest");
    expect(getCrests(state, "first")[0]!.countdown).toBe(2);
    expect(getHP(state, "second")).toBe(0);
  });

  it("enemy:crest affects only the opponent's crests", () => {
    state.players.first.crests = [
      { name: "Ally Crest", owner: "first", countdown: 2 } as any,
    ];
    state.players.second.crests = [
      { name: "Enemy Crest", owner: "second", countdown: 2 } as any,
    ];

    handleCountdown(
      {
        op: "countdown",
        action: "delay",
        target: "enemy:crest",
        amount: 1,
      } as any,
      { owner: "first" },
    );

    expect(getCrests(state, "first")[0]!.countdown).toBe(2);
    expect(getCrests(state, "second")[0]!.countdown).toBe(3);
  });
});
