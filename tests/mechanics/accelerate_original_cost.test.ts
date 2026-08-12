/**
 * @file Mechanic Contract Test: Accelerate / Crystallize original (base) cost
 *
 * Bible: docs/svwb_rulebook_formatted.md —
 *   Owner ruling — Accelerate / Crystallize original cost (2026-08-12).
 *
 * INVARIANTS:
 * - Playing via Accelerate does NOT rewrite printed/base cost to the Accelerate N
 * - A follower summoned by Accelerate text reports the printed base cost
 * - Portalcraft "base cost of 5 or more" payoffs therefore fire off an
 *   Accelerate-summoned Shoddy Plaything (base 6, Accelerate 2)
 * - Negative control: without a ≥5 base-cost ally, those payoffs do not fire
 *
 * Proof deck (owner): Shoddy Plaything + Yog-Zentha / Advent / Unfeeling Eld Axe.
 * Contradicts the 2018 original-Shadowverse Cygames tweet; WB owner's ruling wins.
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
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { evaluateCardCondition } from "../../src/logic/core/conditions/evaluator.js";
import { getBoard, getHand, getPP } from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

const SHODDY = "10671110";
const YOG = "10674120";
const ADVENT = "10671310";
const UNFEELING = "10673310";
const DEPTHS_NAME = "Depths of the Eld Axe";

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function accelerateShoddy(): void {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
    .withFirstHand([SHODDY])
    .withFirstPP(2, 6)
    .build();
  state.gameStarted = true;
  state.phase = "main";

  const planCard = getHand(state, "first")[0]!;
  expect(planCard.base_cost).toBe(6);
  expect(planCard.cost).toBe(6);

  const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
  expect(outcome.kind).toBe("done");
  expect(getPP(state, "first")).toBe(0);
}

describe("Owner ruling — Accelerate original cost (2026-08-12)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("Yog-Zentha and Depths of the Eld Axe are implemented (not stubs)", () => {
    const yog = getCardById(YOG);
    expect(yog?.name).toBe("Yog-Zentha, Eld Axe");
    expect(getImplementationStatus(yog!)).toBe("implemented");

    const depths = getCardById("90074320");
    expect(depths?.name).toBe(DEPTHS_NAME);
    expect(depths?.type).toBe("Spell");
  });

  it("Accelerate-summoned Shoddy Plaything reports base cost 6 (not Accelerate 2)", () => {
    accelerateShoddy();

    const shoddy = getBoard(state, "first").find(
      (c) => c.name === "Shoddy Plaything",
    );
    expect(shoddy).toBeTruthy();
    expect(Number(shoddy!.base_cost)).toBe(6);
    expect(Number(shoddy!.cost)).toBe(6);
    expect(evaluateCardCondition(shoddy, { base_cost_gte: 5 })).toBe(true);
    expect(evaluateCardCondition(shoddy, { base_cost_eq: 2 })).toBe(false);
  });

  it("Accelerate Shoddy → Yog-Zentha Fanfare adds Depths of the Eld Axe", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([SHODDY, YOG])
      .withFirstPP(4, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );
    expect(
      getBoard(state, "first").some((c) => c.name === "Shoddy Plaything"),
    ).toBe(true);

    const yogIdx = getHand(state, "first").findIndex(
      (c) => c.name === "Yog-Zentha, Eld Axe",
    );
    expect(yogIdx).toBeGreaterThanOrEqual(0);
    expect(
      playCardNoRender(getHand(state, "first"), "first", yogIdx).kind,
    ).toBe("done");
    expect(getHand(state, "first").some((c) => c.name === DEPTHS_NAME)).toBe(
      true,
    );
  });

  it("Accelerate Shoddy → Advent of the Eld Axe draws when ally base cost ≥5", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([SHODDY, ADVENT])
      .withFirstDeck(["10601110", "10601110"])
      .withFirstPP(4, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );

    const enemy = createCard(
      {
        name: "Enemy",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
      },
      "board",
      "second",
    );
    state.players.second.board.push(enemy);

    const handBeforeAdvent = getHand(state, "first").length;
    const adventIdx = getHand(state, "first").findIndex(
      (c) => c.name === "Advent of the Eld Axe",
    );
    const adventOut = playCardNoRender(
      getHand(state, "first"),
      "first",
      adventIdx,
    );
    expect(adventOut.kind).toBe("paused");
    resolveFirstPending();
    expect(enemy.defense).toBe(1);
    // Spell left hand (−1) then draw (+1) → same length as before Advent
    expect(getHand(state, "first").length).toBe(handBeforeAdvent);
  });

  it("Accelerate Shoddy → Unfeeling Eld Axe in-hand cost drops by 1 until EOT", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([SHODDY, UNFEELING])
      .withFirstPP(2, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const unfeeling = () =>
      getHand(state, "first").find((c) => c.name === "Unfeeling Eld Axe")!;
    expect(getEffectiveCost(unfeeling())).toBe(3);

    expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
      "done",
    );
    expect(getEffectiveCost(unfeeling())).toBe(2);
    expect(Number(unfeeling().cost_mod) || 0).toBe(-1);
  });

  it("negative control: no base-cost-≥5 ally → Yog / Advent / Unfeeling do not fire", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([YOG, ADVENT, UNFEELING])
      .withFirstDeck(["10601110", "10601110"])
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const small = createCard(
      {
        name: "Small Ally",
        type: "Follower",
        cost: 2,
        base_cost: 2,
        attack: 1,
        defense: 1,
      },
      "board",
      "first",
    );
    state.players.first.board.push(small);

    const unfeeling = () =>
      getHand(state, "first").find((c) => c.name === "Unfeeling Eld Axe")!;
    expect(getEffectiveCost(unfeeling())).toBe(3);

    // Yog enters (base cost 2) — must NOT add Depths; must NOT drop Unfeeling
    const yogIdx = getHand(state, "first").findIndex(
      (c) => c.name === "Yog-Zentha, Eld Axe",
    );
    expect(
      playCardNoRender(getHand(state, "first"), "first", yogIdx).kind,
    ).toBe("done");
    expect(getHand(state, "first").some((c) => c.name === DEPTHS_NAME)).toBe(
      false,
    );
    expect(getEffectiveCost(unfeeling())).toBe(3);

    const enemy = createCard(
      {
        name: "Enemy",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
      },
      "board",
      "second",
    );
    state.players.second.board.push(enemy);

    const handBefore = getHand(state, "first").length;
    const adventIdx = getHand(state, "first").findIndex(
      (c) => c.name === "Advent of the Eld Axe",
    );
    const adventOut = playCardNoRender(
      getHand(state, "first"),
      "first",
      adventIdx,
    );
    expect(adventOut.kind).toBe("paused");
    resolveFirstPending();
    expect(enemy.defense).toBe(1);
    // Spell left hand, no draw → hand shrinks by 1
    expect(getHand(state, "first").length).toBe(handBefore - 1);
    expect(getEffectiveCost(unfeeling())).toBe(3);
  });
});
