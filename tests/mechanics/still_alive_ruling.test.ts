/**
 * Owner ruling (2026-09-08): still_alive — subject is the damage victim.
 * Galmieux crest is the canonical real-card case: allied follower damaged and
 * surviving → Fangs added; destroyed → not.
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
import { dealDamage } from "../../src/logic/core/barrier.js";
import { getHand, getCrests } from "../../src/core/playerHelpers.js";

const GALMIEX = "10344120";
const FANGS = "Fangs of Ardent Destruction";

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; seed?: number } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  givenGameState({
    seed: opts.seed ?? 42,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(pp, max)
    .withSecondPP(max, max)
    .withFirstHand(opts.hand ?? [])
    .build();
}

function fangsInHand(): number {
  return getHand(state, "first").filter((c) => c.name?.includes(FANGS)).length;
}

function allyFollower(def: number, atk = 2, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

describe("still_alive ruling — Galmieux crest (10344120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("allied follower damaged and surviving adds exactly one Fangs to hand", () => {
    setupTurn(6, { hand: [GALMIEX], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Galmieux")),
    ).toBe(true);

    const ally = allyFollower(5);
    const before = fangsInHand();
    dealDamage(ally, 2, "second");

    expect(Number(ally.defense)).toBe(3);
    expect(fangsInHand()).toBe(before + 1);
  }, 60_000);

  it("allied follower destroyed by damage does not add Fangs to hand", () => {
    setupTurn(6, { hand: [GALMIEX], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Galmieux")),
    ).toBe(true);

    const ally = allyFollower(2);
    const before = fangsInHand();
    dealDamage(ally, 5, "second");

    expect(Number(ally.defense)).toBeLessThanOrEqual(0);
    expect(fangsInHand()).toBe(before);
  }, 60_000);
});
