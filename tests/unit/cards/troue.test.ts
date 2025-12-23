// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../../src/core/gameState";
import { engageAmulet } from "../../../src/logic/effects/ops/engage";
import { makeCardFromDB } from "../../../src/logic/effects/ops/summon_ops/core";
import masterCardDefinitions from "../../../cards/sets/10004_skybound-dragons.json";
import { CardInstance } from "../../../src/core/types";

describe("Troue, Heroic Visionary (10461110)", () => {
  beforeEach(() => {
    state.blueHand = [];
    state.blueBoard = [];
    state.redBoard = [];
    state.bluePP = 10;
    state.blueMaxPP = 10;
    state.isBlueTurn = true;
    if (!state.rng)
      state.rng = {
        makeUid: () => Math.random().toString(36).substr(2, 9),
      } as any;
  });

  it("should gain Drain when an amulet is engaged", () => {
    // 1. Setup Troue
    const troueDef: any = masterCardDefinitions.find(
      (c: any) => c.id === "10461110",
    );
    const troue = makeCardFromDB(troueDef, "blue");

    // 2. Setup Dummy Engage Amulet
    const amuletDef: any = {
      id: "999000",
      name: "Dummy Engage Amulet",
      type: "Amulet",
      cost: 1,
      hasEngage: true,
      engageCost: 0,
      engageEffects: [{ op: "draw", source: "named", name: "Fairy", count: 0 }], // specific effect irrelevant, just need to run
    };
    const amulet = makeCardFromDB(amuletDef, "blue");

    // 3. Place on board
    state.blueBoard = [troue, amulet];
    // Indices: Troue=0, Amulet=1

    // Verify pre-condition: Troue has no drain
    expect(
      troue.keywords?.some((k: any) => k === "Drain" || k.name === "Drain"),
    ).toBeFalsy();

    // 4. Engage Amulet
    engageAmulet("blue", 1);

    // 5. Verify Post-condition: Troue has Drain
    // Drain is usually stored in keywordState.drain or keywords array depending on implementation of 'buff_self'
    // 'buff_self' with keywords usually pushes to 'keywords' array AND updates state if standardized.
    // Let's check both
    // Debug logging
    console.log("Troue Keywords:", JSON.stringify(troue.keywords, null, 2));

    const hasDrainKeyword = troue.keywords?.some(
      (k: any) => k === "drain" || k.name === "drain",
    );

    expect(hasDrainKeyword).toBe(true);
  });
});
