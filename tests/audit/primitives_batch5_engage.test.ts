/**
 * Batch 5 — Engage primitive (rulebook §290–294).
 * Assertions from docs/svwb_rulebook_formatted.md + card text only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHP, getPP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("Rulebook §290–294 — Engage", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("§294 — Engage usable same turn amulet is played (Serene Sanctuary)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10161210"])
      .withFirstPP(3, 6)
      .build();
    whenPlayCard("first", 0);
    const sanctuary = findOnBoard("first", "Serene Sanctuary")!;
    expect(sanctuary.countdown).toBe(3);
    engageAmulet("first", 0);
    expect(sanctuary.countdown).toBe(2);
  });

  it("§292–294 — Engage (1) pays PP; once per turn blocks second Engage", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10161210"])
      .withFirstPP(3, 6)
      .build();
    whenPlayCard("first", 0);
    const ppBefore = getPP(state, "first");
    engageAmulet("first", 0);
    expect(getPP(state, "first")).toBe(ppBefore - 1);
    const sanctuary = findOnBoard("first", "Serene Sanctuary")!;
    const cdAfterFirst = sanctuary.countdown;
    engageAmulet("first", 0);
    expect(sanctuary.countdown).toBe(cdAfterFirst);
  });

  it("Engage with target — Darkhaven Grace buffs ally and restores leader", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10162210"])
      .withFirstPP(3, 6)
      .build();
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    const graceIdx = state.players.first.board.findIndex(
      (c) => c.name === "Darkhaven Grace",
    );
    engageAmulet("first", graceIdx);
    resolveFirstPending();
    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(3);
    expect(getHP(state, "first")).toBe(19);
  });

  it("Self-destruct Engage removes amulet — Dose of Holiness damages enemy and restores", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10162220"])
      .withFirstPP(4, 6)
      .build();
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy.peak_defense = 5;
    state.players.second.board = [enemy];
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    const doseIdx = state.players.first.board.findIndex(
      (c) => c.name === "Dose of Holiness",
    );
    engageAmulet("first", doseIdx);
    resolveFirstPending();
    expect(
      state.players.first.board.some((c) => c.name === "Dose of Holiness"),
    ).toBe(false);
    expect(enemy.defense).toBe(1);
    expect(getHP(state, "first")).toBe(19);
  });
});
