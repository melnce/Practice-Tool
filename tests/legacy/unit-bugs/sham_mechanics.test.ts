import { describe, it, expect, beforeEach } from "vitest";
import { computeHandGlow } from "../../../src/ui/helpers/glow";
import { state, resetGameState } from "../../../src/core/gameState";
import {
  handleGainCrest,
  crestAddCounter,
} from "../../../src/logic/effects/crest";
import { runEffects } from "../../../src/logic/core/effects/index";

describe("Sham-Nacha Mechanics", () => {
  beforeEach(() => {
    resetGameState(1);
    (globalThis as any).HEADLESS = true;
  });

  it("should glow yellow if and only if Faith >= 10", () => {
    // Setup Faith Crest
    handleGainCrest(
      { name: "Faith: Sham-Nacha, Heir to Entwining" } as any,
      "first",
    );

    const card = {
      name: "Sham-Nacha, Heir to Entwining",
      type: "Follower",
      cost: 2,
      fanfare: [],
    } as any;
    const ctx = {
      state,
      owner: "first",
      isPlayersTurn: true,
      availablePP: 10,
      isSpell: false,
    };

    // Case 1: Faith < 10
    crestAddCounter("first", "Faith: Sham-Nacha, Heir to Entwining", "faith", 9);
    let res = computeHandGlow(card, ctx);
    console.log("Faith 9 Glow:", res.glowClass);
    expect(res.glowClass).not.toBe("enhance-ready");
    expect(res.glowClass).toBe("playable-glow");

    // Case 2: Faith = 10
    crestAddCounter("first", "Faith: Sham-Nacha, Heir to Entwining", "faith", 1); // 9+1=10
    res = computeHandGlow(card, ctx);
    console.log("Faith 10 Glow:", res.glowClass);
    expect(res.glowClass).toBe("enhance-ready");
  });

  it("should consume 10 faith and grant Choose Bonus", () => {
    // Setup
    handleGainCrest(
      { name: "Faith: Sham-Nacha, Heir to Entwining" } as any,
      "first",
    );
    crestAddCounter(
      "first",
      "Faith: Sham-Nacha, Heir to Entwining",
      "faith",
      15,
    );
    state.players.first.modeBonus = 0;

    // Simulate Sham-Nacha Fanfare Effect
    const fanfare = [
      {
        op: "crest",
        action: "pay_counter",
        crest: "Faith: Sham-Nacha, Heir to Entwining",
        counter: "faith",
        amount: 10,
        on_success_effects: [{ op: "mode_bonus", amount: 1 }],
      },
    ];

    runEffects(fanfare as any, "first", null);

    // Verify Consumption (now using nested player state)
    const crest = state.players.first.crests.find((c) => c.name.includes("Sham-Nacha"));
    expect(crest!.counters!.faith).toBe(5); // 15 - 10 = 5

    // Verify Bonus (now using nested player state)
    expect(state.players.first.modeBonus).toBe(1);
  });
});
