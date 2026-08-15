import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  createCard,
  resetUidCounter,
  givenGameState,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleDestroy } from "../../src/logic/effects/ops/destroy/unified.js";

describe("destroy filter merge", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 }).build();
    state.gameStarted = true;
  });

  it("filter.not_self overrides condition.not_self:false in destroy pool", () => {
    const f1 = createCard(
      { name: "Self", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const f2 = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [f1, f2];
    const eff = {
      op: "destroy",
      target: "ally:follower",
      filter: { not_self: true },
      condition: { not_self: false },
      select: 1,
    };
    handleDestroy(eff as any, "first", [], { owner: "first", sourceCard: f1 });
    const pool = state.pendingTargetEffect?.pool ?? [];
    expect(pool.map((c) => c.name)).toEqual(["Ally"]);
  });
});
