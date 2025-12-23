// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../../src/core/gameState";
import { handleStatSelf } from "../../../src/logic/effects/self.ts";
import { makeCardFromDB } from "../../../src/logic/effects/ops/summon_ops/core";
import masterCardDefinitions from "../../../cards/sets/10004_skybound-dragons.json";
import { CardInstance } from "../../../src/core/types";

describe("Lamretta, Sisterly Shepherd (10461120)", () => {
  beforeEach(() => {
    state.blueHand = [];
    state.blueBoard = [];
    state.redBoard = [];
    state.bluePP = 10;
    state.blueMaxPP = 10;
    state.isBlueTurn = true;
    state.roundCount = 5; // Simulate mid-game
    if (!state.rng)
      state.rng = {
        makeUid: () => Math.random().toString(36).substr(2, 9),
      } as any;
  });

  it('should gain temporary "Can\'t Attack" on evolve via buff_self', () => {
    // 1. Setup Lamretta
    const lamrettaDef: any = masterCardDefinitions.find(
      (c: any) => c.id === "10461120",
    );
    const lamretta = makeCardFromDB(lamrettaDef, "blue");

    // 2. Mock Evolve Effect call (since we just want to test the keyword logic patched in buff_self)
    // Usually Evolve ops are run by `src/logic/effects/ops/evolve.ts` which calls `evolve_self`.
    // But Lamretta uses `buff_self` inside `evolve` effects array.
    // We can simulate the `buff_self` call directly to verify our engine patch.

    const eff = {
      op: "stat",
      keywords: ["Can't Attack"],
      duration: "turn_end",
    };

    // 3. Execute
    handleStatSelf(lamretta, eff as any);
    console.log(
      "Lamretta Keywords:",
      JSON.stringify(lamretta.keywords, null, 2),
    );
    console.log(
      "Lamretta KeywordState:",
      JSON.stringify(lamretta.keywordState, null, 2),
    );

    // 4. Verify
    // Temporary "Can't Attack" is NOT added to keywords array (see apply.ts logic), only to state.
    // So we only verify keywordState.

    // Check KeywordState for expiry injection
    expect(lamretta.keywordState?.cantAttack).toBe(true);
    expect(lamretta.keywordState?.cantAttackExpiresOnTurn).toBe(5); // Should match state.roundCount
  });
});
