/**
 * Alchemic Flare (10433310) — data-bound playability and resolution audit.
 * Loads real card data by id; do not hand-write effect lists.
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
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

const FLARE_ID = "10433310";
const R6 = 6;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
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
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function allyFollower(def: number, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function flareInHand() {
  const flare = thenHand("first").find((c) => c.id === FLARE_ID);
  expect(flare).toBeDefined();
  return flare!;
}

function earthSigilOnBoard(player: "first" | "second" = "first") {
  return thenBoard(player).find(
    (c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
}

describe("Alchemic Flare (10433310) — real card data", () => {
  beforeEach(() => resetUidCounter());

  it("card data loads from registry with nested select on spell[0]", () => {
    const template = getCardById(FLARE_ID);
    expect(template).toBeDefined();
    expect(template!.spell).toBeDefined();
    expect(template!.spell!.length).toBeGreaterThanOrEqual(1);
  });

  it("with two enemy followers: canPlayCard returns ok", () => {
    setupTurn(R6, { hand: [FLARE_ID], pp: 2 });
    enemyFollower(5, "Enemy A");
    enemyFollower(5, "Enemy B");
    const flare = flareInHand();

    const preflight = canPlayCard(flare, "first");
    expect(preflight).toEqual({ ok: true });
  });

  it("playing opens pending pool with exactly the two enemy followers", () => {
    setupTurn(R6, { hand: [FLARE_ID], pp: 2 });
    const enemyA = enemyFollower(5, "Enemy A");
    const enemyB = enemyFollower(5, "Enemy B");
    const ally = allyFollower(5, "Ally");

    const flare = flareInHand();
    const outcome = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(flare),
    );
    expect(outcome.kind).toBe("paused");
    expect(state.pendingTargetEffect).toBeTruthy();

    const poolUids = state.pendingTargetEffect!.poolUids ?? [];
    const pool = state.pendingTargetEffect!.pool ?? [];
    const resolvedUids =
      poolUids.length > 0 ? poolUids : pool.map((c) => String(c.uid ?? ""));
    expect(resolvedUids).toHaveLength(2);
    expect(resolvedUids).toContain(String(enemyA.uid));
    expect(resolvedUids).toContain(String(enemyB.uid));
    expect(resolvedUids).not.toContain(String(ally.uid));
  });

  it("resolving onto one enemy deals 4 damage, leaves other untouched, summons Magic Sediment", () => {
    setupTurn(R6, { hand: [FLARE_ID], pp: 2 });
    const enemyA = enemyFollower(5, "Enemy A");
    const enemyB = enemyFollower(5, "Enemy B");
    const flare = flareInHand();

    whenPlayCard("first", getHand(state, "first").indexOf(flare));
    resolvePendingTarget(String(enemyA.uid));

    expect(enemyA.defense).toBe(1);
    expect(enemyB.defense).toBe(5);
    expect(earthSigilOnBoard()).toBeDefined();
    expect(thenBoard("first").some((c) => c.name === "Magic Sediment")).toBe(
      true,
    );
  });

  it("with empty enemy field: spell is unplayable", () => {
    setupTurn(R6, { hand: [FLARE_ID], pp: 2 });
    const flare = flareInHand();

    const preflight = canPlayCard(flare, "first");
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.reason).toMatch(/target/i);
    }
  });

  it("with only allied followers: spell is unplayable", () => {
    setupTurn(R6, { hand: [FLARE_ID], pp: 2 });
    allyFollower(5, "Ally");
    const flare = flareInHand();

    const preflight = canPlayCard(flare, "first");
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.reason).toMatch(/target/i);
    }
  });
});
