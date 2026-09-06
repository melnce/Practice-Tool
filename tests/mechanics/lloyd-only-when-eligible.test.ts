/**
 * Official Q&A: Lloyd (90074120) forces targeting only when Lloyd is itself
 * a legal target of the ability (Cleric of Crushing 10261110).
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
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

const CLERIC = "10261110";
const ORCHIS = "10174120";
const LLOYD = "90074120";
const ADVENT_ELD_AXE = "10671310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    active?: "first" | "second";
    secondHand?: string[];
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
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
}

describe("Lloyd restriction — only when Lloyd is pool-eligible", () => {
  beforeEach(() => resetUidCounter());

  it("unevolved Lloyd + super-evolved Orchis: Orchis is selectable and destroyed", () => {
    setupTurn(6, { hand: [CLERIC], pp: 3 });
    const orchis = createCard(ORCHIS, "board", "second");
    orchis.peak_defense = orchis.defense;
    const lloyd = createCard(LLOYD, "board", "second");
    lloyd.peak_defense = lloyd.defense;
    state.players.second.board.push(orchis, lloyd);
    state.players.second.superEvoCharges = 1;
    handleEvolveSelf(orchis, "second", { mode: "super", spendPoint: true });

    whenPlayCard("first", 0);
    const cleric = findOnBoard("first", "Cleric of Crushing")!;
    state.players.first.evoCharges = 1;
    handleEvolveSelf(cleric, "first", { mode: "normal", spendPoint: true });

    const pending = state.pendingTargetEffect!;
    expect(poolUids()).toContain(orchis.uid);
    expect(validateTargetSelection(state, pending, orchis.uid).ok).toBe(true);
    resolvePendingTarget(orchis.uid);
    cleanupDead();
    expect(findOnBoard("second", "Orchis, Newfound Heart")).toBeFalsy();
    expect(findOnBoard("second", "Lloyd")).toBeTruthy();
  });

  it("super-evolved Lloyd + super-evolved Orchis: Orchis refused, Lloyd selectable", () => {
    setupTurn(6, { hand: [CLERIC], pp: 3 });
    const orchis = createCard(ORCHIS, "board", "second");
    orchis.peak_defense = orchis.defense;
    const lloyd = createCard(LLOYD, "board", "second");
    lloyd.peak_defense = lloyd.defense;
    state.players.second.board.push(orchis, lloyd);
    state.players.second.superEvoCharges = 2;
    handleEvolveSelf(lloyd, "second", { mode: "super", spendPoint: true });
    handleEvolveSelf(orchis, "second", { mode: "super", spendPoint: true });
    // Orchis super-evolve may summon tokens; Lloyd must stay pool-eligible.
    state.players.second.board = state.players.second.board.filter(
      (c) => c.uid === orchis.uid || c.uid === lloyd.uid,
    );

    whenPlayCard("first", 0);
    const cleric = findOnBoard("first", "Cleric of Crushing")!;
    state.players.first.evoCharges = 1;
    handleEvolveSelf(cleric, "first", { mode: "normal", spendPoint: true });

    const pending = state.pendingTargetEffect!;
    expect(poolUids()).toContain(lloyd.uid);
    expect(validateTargetSelection(state, pending, orchis.uid).ok).toBe(false);
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
  });

  it("positive control: generic enemy-follower select with unevolved Lloyd — only Lloyd", () => {
    setupTurn(6, {
      active: "second",
      secondHand: [ADVENT_ELD_AXE],
    });
    state.players.second.pp = 2;
    state.players.second.maxPP = 6;
    const lloyd = createCard(LLOYD, "board", "first");
    lloyd.peak_defense = lloyd.defense;
    const buddy = createCard(
      { name: "Buddy", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    buddy.peak_defense = 2;
    state.players.first.board.push(lloyd, buddy);
    whenPlayCard("second", 0);
    const pending = state.pendingTargetEffect!;
    expect(validateTargetSelection(state, pending, buddy.uid).ok).toBe(false);
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
  });
});

describe("Lloyd restriction — sabotage proof", () => {
  it("would allow Orchis if Lloyd were enforced from the whole board, not the pool", () => {
    setupTurn(6, { hand: [CLERIC], pp: 3 });
    const orchis = createCard(ORCHIS, "board", "second");
    orchis.peak_defense = orchis.defense;
    const lloyd = createCard(LLOYD, "board", "second");
    lloyd.peak_defense = lloyd.defense;
    state.players.second.board.push(orchis, lloyd);
    state.players.second.superEvoCharges = 1;
    handleEvolveSelf(orchis, "second", { mode: "super", spendPoint: true });

    whenPlayCard("first", 0);
    const cleric = findOnBoard("first", "Cleric of Crushing")!;
    state.players.first.evoCharges = 1;
    handleEvolveSelf(cleric, "first", { mode: "normal", spendPoint: true });

    const pending = state.pendingTargetEffect!;
    // Sabotage: old rule blocked any non-Lloyd when Lloyd existed on board.
    expect(validateTargetSelection(state, pending, orchis.uid).ok).toBe(true);
  });
});
