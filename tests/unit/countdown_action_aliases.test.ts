/**
 * Regression: crest `{ action: "delay_countdown" }` must delay, not advance.
 * Dragon's Vale Elder SE previously completed the crest because normalizeAction
 * only recognized bare "delay" / "advance" and defaulted delay_countdown → advance.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { handleCountdown } from "../../src/logic/effects/ops/countdown/unified.js";
import { getCrests } from "../../src/core/playerHelpers.js";

describe("countdown action aliases", () => {
  beforeEach(() => {
    resetGameState(1);
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.crests = [
      {
        name: "Dragon's Vale Elder",
        owner: "first",
        countdown: 2,
        triggers: [],
      } as any,
    ];
  });

  it("delay_countdown increases crest countdown", () => {
    handleCountdown(
      {
        op: "countdown",
        action: "delay_countdown",
        name: "Dragon's Vale Elder",
        amount: 2,
      } as any,
      { owner: "first" },
    );
    const crest = getCrests(state, "first").find(
      (c) => c.name === "Dragon's Vale Elder",
    )!;
    expect(crest.countdown).toBe(4);
  });

  it("advance_countdown decreases crest countdown", () => {
    handleCountdown(
      {
        op: "countdown",
        action: "advance_countdown",
        name: "Dragon's Vale Elder",
        amount: 1,
      } as any,
      { owner: "first" },
    );
    const crest = getCrests(state, "first").find(
      (c) => c.name === "Dragon's Vale Elder",
    )!;
    expect(crest.countdown).toBe(1);
  });
});
