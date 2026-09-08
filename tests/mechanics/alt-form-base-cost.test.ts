/**
 * @file Mechanic Contract Test: Alternate-form played card base cost
 *
 * Owner ruling 2026-09-06 — Accelerate / Crystallize played card takes the
 * alternate form's base cost (corrects 2026-08-12). Official Q&A: Zerael
 * `10904110` — accelerated Jailor of Antiquity base cost is 1.
 *
 * Summoned bodies from alternate-form text keep printed base cost (Eld Axe
 * package unchanged — see accelerate_original_cost.test.ts).
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import {
  getBoard,
  getGraveyard,
  getHand,
  getPP,
  getShadows,
} from "../../src/core/playerHelpers.js";
import {
  hasPlayedBaseCostLadder,
  recordPlayedBaseCost,
} from "../../src/logic/core/playedBaseCostHistory.js";
import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import { setCostAcc } from "../../src/logic/effects/ops/cost/model.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import "../../src/logic/core/effects/index.js";

const JAILOR = "10901110";
const SHODDY = "10671110";
const YOG = "10674120";
const DEPTHS_NAME = "Depths of the Eld Axe";
const VENERATING_DYER = "10662110";

function enemyFollower(def = 5) {
  const c = createCard(
    { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  state.players.second.board.push(c);
  return c;
}

describe("Alternate-form played card base cost (2026-09-06)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  describe("10904110 Zerael — accelerated Jailor of Antiquity base cost", () => {
    it("10904110 Zerael — accelerated Jailor of Antiquity base cost is 1 (official Q&A)", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
        .withFirstHand([JAILOR])
        .withFirstPP(1, 6)
        .build();
      enemyFollower(5);
      const shadowsBefore = getShadows(state, "first");

      expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
        "done",
      );

      const costs = state.players.first.playedBaseCostsThisMatch;
      expect(costs).toContain(1);
      expect(costs).not.toContain(6);

      const gy = getGraveyard(state, "first").find((c) => c.id === JAILOR)!;
      expect(gy.type).toBe("Spell");
      expect(Number(gy.cost)).toBe(1);
      expect(Number(gy.base_cost)).toBe(1);
      expect(Number((gy as any).originalPrintedBaseCost)).toBe(6);
      expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
      expect(getPP(state, "first")).toBe(0);
    }, 60_000);
  });

  it("Jailor normal play (6 PP): ladder records 6; follower on board base cost 6", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([JAILOR])
      .withFirstPP(6, 6)
      .build();
    enemyFollower(8);

    const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
    expect(outcome.kind).toBe("paused");

    expect(state.players.first.playedBaseCostsThisMatch).toContain(6);
    expect(state.players.first.playedBaseCostsThisMatch).not.toContain(1);

    const jailor = getBoard(state, "first").find(
      (c) => c.name === "Jailor of Antiquity",
    )!;
    expect(jailor.type).toBe("Follower");
    expect(Number(jailor.base_cost)).toBe(6);
  }, 60_000);

  it("Shoddy Accelerate after Spellboost reductions: played cost is 2 not boosted printed", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([SHODDY])
      .withFirstPP(2, 6)
      .build();

    const shoddy = getHand(state, "first")[0]!;
    setCostAcc(shoddy, -3);
    expect(getEffectiveCost(shoddy)).toBe(3);

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );

    const body = getBoard(state, "first").find(
      (c) => c.name === "Shoddy Plaything",
    )!;
    expect(Number(body.base_cost)).toBe(6);
    expect(getEffectiveCost(body)).toBe(6);
    expect(state.players.first.playedBaseCostsThisMatch).toContain(2);
    expect(state.players.first.playedBaseCostsThisMatch).not.toContain(6);
  }, 60_000);

  it("Shoddy Accelerate (2): ladder 2; summoned body base cost 6; Yog adds Depths", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([SHODDY, YOG])
      .withFirstPP(4, 6)
      .build();

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );
    expect(state.players.first.playedBaseCostsThisMatch).toContain(2);
    expect(state.players.first.playedBaseCostsThisMatch).not.toContain(6);

    const shoddy = getBoard(state, "first").find(
      (c) => c.name === "Shoddy Plaything",
    )!;
    expect(Number(shoddy.base_cost)).toBe(6);

    const yogIdx = getHand(state, "first").findIndex((c) => c.id === YOG);
    expect(
      playCardNoRender(getHand(state, "first"), "first", yogIdx).kind,
    ).toBe("done");
    expect(getHand(state, "first").some((c) => c.name === DEPTHS_NAME)).toBe(
      true,
    );
  }, 60_000);

  it("Zerael ladder: accelerated Jailor completes 1–8 when 2–8 already recorded", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([JAILOR])
      .withFirstPP(1, 6)
      .build();
    enemyFollower(5);
    for (let c = 2; c <= 8; c++) recordPlayedBaseCost(state, "first", c);

    expect(
      hasPlayedBaseCostLadder(state, "first", [1, 2, 3, 4, 5, 6, 7, 8]),
    ).toBe(false);

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );

    expect(
      hasPlayedBaseCostLadder(state, "first", [1, 2, 3, 4, 5, 6, 7, 8]),
    ).toBe(true);
  }, 60_000);

  it("Venerating Dyer Crystallize (1): ladder 1; field amulet base cost 1; bounce keeps amulet cost 1", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 4 })
      .withFirstHand([VENERATING_DYER])
      .withFirstPP(1, 4)
      .build();

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );
    expect(state.players.first.playedBaseCostsThisMatch).toContain(1);
    expect(state.players.first.playedBaseCostsThisMatch).not.toContain(4);

    const amulet = getBoard(state, "first")[0]!;
    expect(amulet.type).toBe("Amulet");
    expect(Number(amulet.base_cost)).toBe(1);
    expect(Number(amulet.cost)).toBe(1);

    bounceToHand(amulet);
    const handCopy = getHand(state, "first").find(
      (c) => c.name === "Venerating Dyer",
    )!;
    expect(handCopy.type).toBe("Amulet");
    expect(Number(handCopy.base_cost)).toBe(1);
    expect(Number(handCopy.cost)).toBe(1);
  }, 60_000);
});
