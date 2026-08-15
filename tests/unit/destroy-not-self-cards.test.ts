/**
 * Destroy ops with "another allied …" must exclude the source card from selection.
 * Card data uses filter:{not_self:true}; engine merges filter into getPool condition.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
}

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function allyFollower(name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 1, attack: 1, defense: 1 },
    "board",
    "first",
  );
  c.peak_defense = 1;
  state.players.first.board.push(c);
  return c;
}

describe("destroy not_self — select-another cards", () => {
  beforeEach(() => resetUidCounter());

  it("10372110 Supplicant — fanfare pool excludes self; ally pick runs then damage", () => {
    setupTurn(6, { hand: ["10372110"], pp: 2 });
    const ally = allyFollower();
    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    foe.peak_defense = 5;
    state.players.second.board.push(foe);
    whenPlayCard("first", 0);
    const source = findOnBoard("first", "Supplicant of Destruction")!;
    expect(poolUids()).not.toContain(source.uid);
    resolvePendingTarget(ally.uid);
    cleanupDead();
    expect(findOnBoard("first", "Ally")).toBeFalsy();
    expect(Number(foe.defense)).toBeLessThan(5);
  });

  it("10372110 Supplicant — evolve replicate pool still excludes self", () => {
    setupTurn(6, { hand: ["10372110"], pp: 2 });
    const ally = allyFollower();
    whenPlayCard("first", 0);
    const source = findOnBoard("first", "Supplicant of Destruction")!;
    resolvePendingTarget(ally.uid);
    cleanupDead();
    onEvolve(source, "first", "normal");
    expect(poolUids()).not.toContain(source.uid);
  });

  it("10372210 Wasteland — fanfare pool excludes self; ally pick draws 2", () => {
    setupTurn(6, {
      hand: ["10372210"],
      pp: 2,
      deck: ["10171320", "10171310"],
    });
    const ally = allyFollower("Token");
    whenPlayCard("first", 0);
    const source = findOnBoard("first", "Wasteland of Destruction")!;
    expect(poolUids()).not.toContain(source.uid);
    resolvePendingTarget(ally.uid);
    cleanupDead();
    expect(findOnBoard("first", "Token")).toBeFalsy();
    expect(getHand(state, "first").length).toBe(2);
  });

  it("10653110 Deprived Destroyer — pool excludes self; ally pick evolves source + Bat", () => {
    setupTurn(5, { hand: ["10653110"], pp: 5 });
    const ally = allyFollower();
    whenPlayCard("first", 0);
    const source = findOnBoard("first", "Deprived Destroyer")!;
    expect(poolUids()).not.toContain(source.uid);
    resolvePendingTarget(ally.uid);
    cleanupDead();
    expect(findOnBoard("first", "Ally")).toBeFalsy();
    expect(source.hasEvolved).toBe(true);
    expect(findOnBoard("first", "Bat")?.hasEvolved).toBe(true);
  });

  it("10653110 Deprived Destroyer — no other allies: optional select skips then", () => {
    setupTurn(5, { hand: ["10653110"], pp: 5 });
    whenPlayCard("first", 0);
    const source = findOnBoard("first", "Deprived Destroyer")!;
    expect(poolUids()).toHaveLength(0);
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(source.hasEvolved).toBeFalsy();
  });

  it("10753110 Beastmaster Bones — super-evolve pool excludes self", () => {
    setupTurn(7, { hand: ["10753110"], pp: 7 });
    const sacrifice = allyFollower("Sacrifice");
    whenPlayCard("first", 0);
    const bones = findOnBoard("first", "Beastmaster Bones")!;
    state.players.first.superEvoCharges = 1;
    onEvolve(bones, "first", "super");
    expect(poolUids()).not.toContain(bones.uid);
    expect(poolUids()).toContain(sacrifice.uid);
    resolvePendingTarget(sacrifice.uid);
    cleanupDead();
    expect(findOnBoard("first", "Sacrifice")).toBeFalsy();
  });
});
