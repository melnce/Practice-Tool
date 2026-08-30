/**
 * Set 10009 — Hien, Redolent Revenant (`10914120`) in-hand cost reduction.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenBoard,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import "../../src/logic/core/effects/index.js";

const R10 = 10;
const HIEN = "10914120";
const FILLER = "10111310"; // Fairy Convocation (1 PP)

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function hienInHand(): import("../../src/core/types/index.js").CardInstance {
  const hien = getHand(state, "first").find(
    (c) => c.id === HIEN || c.name === "Hien, Redolent Revenant",
  );
  expect(hien).toBeTruthy();
  return hien!;
}

function playFillerFromFirst(): void {
  const hand = getHand(state, "first");
  const idx = hand.findIndex(
    (c) => c.id === FILLER || c.name === "Fairy Convocation",
  );
  expect(idx).toBeGreaterThanOrEqual(0);
  const result = playCardNoRender(hand, "first", idx);
  expect(result.kind).toBe("done");
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("Set 10009 — Hien in-hand cost reduction", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("playing one allied card reduces Hien cost 9 → 8 while in hand", () => {
    setupTurn(R10, {
      hand: [HIEN, FILLER],
      pp: 10,
      deck: [FILLER, FILLER],
    });
    expect(getEffectiveCost(hienInHand())).toBe(9);
    playFillerFromFirst();
    expect(getEffectiveCost(hienInHand())).toBe(8);
  });

  it("reductions stack within the turn (three plays → cost 6)", () => {
    setupTurn(R10, {
      hand: [HIEN, FILLER, FILLER, FILLER],
      pp: 10,
      deck: [FILLER, FILLER, FILLER],
    });
    expect(getEffectiveCost(hienInHand())).toBe(9);
    playFillerFromFirst();
    playFillerFromFirst();
    playFillerFromFirst();
    expect(getEffectiveCost(hienInHand())).toBe(6);
  });

  it("reductions expire at end of turn (back to 9 next turn)", () => {
    setupTurn(R10, {
      hand: [HIEN, FILLER, FILLER],
      pp: 10,
      deck: [FILLER, FILLER, FILLER],
    });
    playFillerFromFirst();
    playFillerFromFirst();
    expect(getEffectiveCost(hienInHand())).toBe(7);
    whenEndTurn();
    whenEndTurn();
    expect(getEffectiveCost(hienInHand())).toBe(9);
  });

  it("opponent playing cards does not reduce Hien in your hand", () => {
    setupTurn(R10, {
      hand: [HIEN],
      pp: 10,
      secondHand: [FILLER],
      secondPP: 10,
      deck: [FILLER, FILLER],
    });
    whenEndTurn();
    expect(state.activePlayer).toBe("second");
    const secondHand = getHand(state, "second");
    const idx = secondHand.findIndex((c) => c.id === FILLER);
    expect(playCardNoRender(secondHand, "second", idx).kind).toBe("done");
    expect(getEffectiveCost(hienInHand())).toBe(9);
  });

  it("cost cannot go below 0", () => {
    setupTurn(R10, {
      hand: [
        HIEN,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
      ],
      pp: 10,
    });
    for (let i = 0; i < 9; i++) {
      playFillerFromFirst();
    }
    expect(getEffectiveCost(hienInHand())).toBe(0);
  });

  it("Fanfare still damages selected enemy follower", () => {
    setupTurn(R10, { hand: [HIEN], pp: 9 });
    const foe = enemyFollower(2, 8);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(4);
  });

  it("Last Words still summons a copy of Hien", () => {
    setupTurn(R10, { hand: [HIEN], pp: 9 });
    enemyFollower(2, 8);
    whenPlayCard("first", 0);
    resolveFirstPending();
    const hien = findOnBoard("first", "Hien, Redolent Revenant")!;
    hien.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter((c) => c.name === "Hien, Redolent Revenant")
        .length,
    ).toBe(1);
  });
});
