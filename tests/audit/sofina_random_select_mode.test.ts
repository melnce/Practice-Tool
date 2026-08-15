/**
 * Sofina (10564110) mode-2: "random unevolved allied follower with Ward".
 * Red-first: select_mode is ignored (shouldAutoSelect reads mode only).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import "../../src/logic/core/effects/index.js";

function wardFollower(name: string) {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      keywords: ["Ward"],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  c.evolved = false;
  c.hasEvolved = false;
  state.players.first.board.push(c);
  return c;
}

describe("Sofina mode-2 random ward evolve (10564110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstPP(5, 6)
      .build();
  });

  it("pre-fix select_mode leaves pending user selection (fails on main card JSON)", () => {
    wardFollower("WardA");
    wardFollower("WardB");
    const selectEff = {
      op: "select",
      target: "ally:follower",
      select: 1,
      select_mode: "random",
      condition: {
        unevolved: true,
        has_keyword: "ward",
        not_self: true,
      },
      effects: [{ op: "evolve", target: "selected:follower" }],
    };
    runEffects([selectEff as any], "first", null);
    expect(state.pendingTargetEffect).toBeTruthy();
  });

  it("fixed mode:random auto-resolves under seed and evolves a ward follower", () => {
    wardFollower("WardA");
    wardFollower("WardB");
    const sofina = getCardById("10564110")!;
    const mode2 = (sofina.fanfare![0] as any).options[1].effects[0];
    expect((mode2 as any).mode).toBe("random");
    expect((mode2 as any).select_mode).toBeUndefined();
    runEffects([mode2], "first", null);
    expect(state.pendingTargetEffect).toBeFalsy();
    const evolvedWard = state.players.first.board.filter(
      (c) =>
        c?.type === "Follower" &&
        c.hasEvolved &&
        (c.hasWard || c.keywordState?.hasWard),
    );
    expect(evolvedWard.length).toBe(1);
  });
});
