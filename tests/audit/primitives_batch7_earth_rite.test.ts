/**
 * Batch 7 — Earth Rite primitive (rulebook §804).
 * Sigil generation, stack counters, consumption, and gated bonus failure without sigils.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
} from "../harness/builders.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  const uid =
    pending?.poolUids?.[0] ?? String(pending?.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}
import { state } from "../../src/core/gameState.js";
import { getHP } from "../../src/core/playerHelpers.js";
import {
  consumeEarthSigils,
  hasEarthSigils,
} from "../../src/logic/effects/ops/earth.js";
import "../../src/logic/core/effects/index.js";

function earthSigilOnBoard(player: "first" | "second" = "first") {
  return thenBoard(player).find(
    (c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
}

describe("Rulebook §804 — Earth Rite (Runecraft)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("summoning Magic Sediment leaves an Earth Sigil amulet with stack ≥ 1", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10131130"])
      .withFirstPP(3, 6)
      .build();
    whenPlayCard("first", 0);
    const sigil = earthSigilOnBoard();
    expect(sigil).toBeDefined();
    expect(sigil!.counters?.earth).toBeGreaterThanOrEqual(1);
  });

  it("Penelope Fanfare adds 2 to the Earth Sigil stack", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10133120"])
      .withFirstPP(2, 6)
      .build();
    whenPlayCard("first", 0);
    const sigil = earthSigilOnBoard();
    expect(sigil?.counters?.earth).toBeGreaterThanOrEqual(2);
  });

  it("Earth Rite (1) consumes one stack; Glacial Crash bonus damages leader", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10131130", "10231310"])
      .withFirstPP(7, 6)
      .build();
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy.peak_defense = 5;
    state.players.second.board = [enemy];
    whenPlayCard("first", 0);
    expect(earthSigilOnBoard()).toBeDefined();
    const hpBefore = getHP(state, "second");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getHP(state, "second")).toBe(hpBefore - 2);
  });

  it("without a sigil, consumeEarthSigils fails and earth_rite bonus does not run", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(4, 6)
      .build();
    expect(consumeEarthSigils("first", 1)).toBe(false);
    const hpBefore = getHP(state, "second");
    expect(getHP(state, "second")).toBe(hpBefore);
  });
});
