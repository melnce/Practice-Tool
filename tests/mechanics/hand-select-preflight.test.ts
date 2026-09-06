/**
 * Mandatory hand-selection preflight for spells (official Q&A: Spilling Red,
 * Doomwright Resurgence). Followers with hand discard fizzle instead (Burnite).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenPP,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { getHand, getPP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const SPILLING_RED = "10642310";
const DOOMWRIGHT = "10172320";
const BURNITE = "10144110";
const STRIKER_ARTIFACT = "90072110";
const MASTERWORK_ARTIFACT = "90074110";
const FILLER = "10001130";

const R6 = 6;
const R8 = 8;

function setupTurn(
  round: number,
  opts: {
    hand?: (string | object)[];
    pp?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function enemyFollower(def = 3, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("Spell hand-select preflight — Spilling Red (10642310)", () => {
  beforeEach(() => resetUidCounter());

  it("alone in hand with enemy follower: blocked, PP unchanged, stays in hand", () => {
    setupTurn(R6, { hand: [SPILLING_RED], pp: 6 });
    enemyFollower();
    const spilling = getHand(state, "first").find(
      (c) => c.id === SPILLING_RED,
    )!;
    const ppBefore = getPP(state, "first");

    expect(canPlayCard(spilling, "first").ok).toBe(false);
    const outcome = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(spilling),
    );
    expect(outcome.kind).toBe("blocked");
    expect(getPP(state, "first")).toBe(ppBefore);
    expect(thenHand("first").some((c) => c.id === SPILLING_RED)).toBe(true);
  });

  it("with filler hand card but no enemy follower: blocked", () => {
    setupTurn(R6, { hand: [SPILLING_RED, FILLER], pp: 6 });
    const spilling = getHand(state, "first").find(
      (c) => c.id === SPILLING_RED,
    )!;
    const ppBefore = getPP(state, "first");

    expect(canPlayCard(spilling, "first").ok).toBe(false);
    const outcome = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(spilling),
    );
    expect(outcome.kind).toBe("blocked");
    expect(getPP(state, "first")).toBe(ppBefore);
    expect(thenHand("first").some((c) => c.id === SPILLING_RED)).toBe(true);
  });

  it("with filler and enemy follower: plays, discards filler, destroys follower", () => {
    setupTurn(R6, { hand: [SPILLING_RED, FILLER], pp: 6 });
    const foe = enemyFollower();
    const spilling = getHand(state, "first").find(
      (c) => c.id === SPILLING_RED,
    )!;
    const filler = getHand(state, "first").find((c) => c.id === FILLER)!;
    const ppBefore = getPP(state, "first");

    expect(canPlayCard(spilling, "first").ok).toBe(true);
    const outcome = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(spilling),
    );
    expect(outcome.kind === "paused" || outcome.kind === "done").toBe(true);

    resolvePendingTarget(filler.uid);
    if (state.pendingTargetEffect) {
      resolvePendingTarget(foe.uid);
    }

    expect(thenPP("first")).toBe(ppBefore - 1);
    expect(thenHand("first").some((c) => c.id === SPILLING_RED)).toBe(false);
    expect(thenHand("first").some((c) => c.id === FILLER)).toBe(false);
    expect(thenBoard("second").length).toBe(0);
  });
});

describe("Spell hand-select preflight — Doomwright Resurgence (10172320)", () => {
  beforeEach(() => resetUidCounter());

  it("with one Artifact follower ≤5: blocked", () => {
    setupTurn(R8, {
      hand: [DOOMWRIGHT, STRIKER_ARTIFACT],
      pp: 5,
    });
    const spell = getHand(state, "first").find((c) => c.id === DOOMWRIGHT)!;
    const ppBefore = getPP(state, "first");

    expect(canPlayCard(spell, "first").ok).toBe(false);
    expect(
      whenPlayCard("first", getHand(state, "first").indexOf(spell)).kind,
    ).toBe("blocked");
    expect(getPP(state, "first")).toBe(ppBefore);
  });

  it("with two Artifact followers ≤5: plays and summons two copies", () => {
    setupTurn(R8, {
      hand: [DOOMWRIGHT, STRIKER_ARTIFACT, STRIKER_ARTIFACT],
      pp: 5,
    });
    const spell = getHand(state, "first").find((c) => c.id === DOOMWRIGHT)!;
    const hand = getHand(state, "first");
    const artifacts = hand.filter((c) => c.id === STRIKER_ARTIFACT);

    expect(canPlayCard(spell, "first").ok).toBe(true);
    whenPlayCard("first", hand.indexOf(spell));
    resolvePendingTarget(artifacts[0]!.uid);
    resolvePendingTarget(artifacts[1]!.uid);

    const copies = thenBoard("first").filter((c) => c.id === STRIKER_ARTIFACT);
    expect(copies.length).toBe(2);
  });

  it("with two Artifacts but one costs >5: blocked", () => {
    setupTurn(R8, {
      hand: [DOOMWRIGHT, STRIKER_ARTIFACT, MASTERWORK_ARTIFACT],
      pp: 5,
    });
    const spell = getHand(state, "first").find((c) => c.id === DOOMWRIGHT)!;

    expect(canPlayCard(spell, "first").ok).toBe(false);
    expect(
      whenPlayCard("first", getHand(state, "first").indexOf(spell)).kind,
    ).toBe("blocked");
  });
});

describe("Follower hand-select fizzle control — Burnite (10144110)", () => {
  beforeEach(() => resetUidCounter());

  it("alone in hand: still playable; Fanfare deals 0 to enemy followers", () => {
    setupTurn(R6, { hand: [BURNITE], pp: 7 });
    const foe = enemyFollower(5);
    const burnite = getHand(state, "first").find((c) => c.id === BURNITE)!;

    expect(canPlayCard(burnite, "first").ok).toBe(true);
    whenPlayCard("first", 0);

    expect(findOnBoard("first", "Burnite, Anathema of Flame")).toBeTruthy();
    expect(Number(foe.defense)).toBe(5);
  });
});
