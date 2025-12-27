import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState";
import { handleGainCrest } from "../../../src/logic/effects/crest";
import { fireTrigger } from "../../../src/logic/core/triggers";
import { adapter } from "../../../src/core/adapter";

(globalThis as any).HEADLESS = true;

describe("Bug: Faith Owner Isolation", () => {
  beforeEach(() => {
    resetGameState(1);
    adapter.render = () => { };
  });

  it("should only increment the active player crest when select_mode is fired", () => {
    // 1. Grant Crest to BOTH players
    const crestDef = {
      op: "crest",
      action: "gain",
      name: "Faith: Sham-Nacha, Heir to Entwining",
      triggers: [
        {
          event: "select_mode",
          effects: [
            {
              op: "crest",
              action: "add_counter",
              crest: "Faith: Sham-Nacha, Heir to Entwining",
              counter: "faith",
              amount: 1,
            },
          ],
        },
      ],
    };

    handleGainCrest(crestDef as any, "first");
    handleGainCrest(crestDef as any, "second");

    // Verify both exist (now using nested player state)
    const firstCrest = state.players.first.crests.find(
      (c) => c.name === "Faith: Sham-Nacha, Heir to Entwining",
    );
    const secondCrest = state.players.second.crests.find(
      (c) => c.name === "Faith: Sham-Nacha, Heir to Entwining",
    );

    expect(firstCrest).toBeDefined();
    expect(secondCrest).toBeDefined();
    expect(firstCrest!.owner).toBe("first");
    expect(secondCrest!.owner).toBe("second");

    // 2. Fire select_mode for first player
    console.log(" firing select_mode for first player...");
    fireTrigger("select_mode", "first", { sourceCard: null });

    // 3. Verify ONLY first player increased
    expect(firstCrest!.counters?.faith || 0).toBe(1);
    expect(secondCrest!.counters?.faith || 0).toBe(0); // Should stay 0
  });
});
