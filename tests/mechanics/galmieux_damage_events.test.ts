/**
 * Galmieux passive damage-event regressions (owner live-play reports).
 * Red-first: super-evolve counter-damage must emit self_damaged; AoE mid-batch
 * deaths must not be random-hit targets for dependent triggers.
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
import { attackFollower } from "../../src/logic/core/combat.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { getBoard, getHand, getCrests } from "../../src/core/playerHelpers.js";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    seed?: number;
  } = {},
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

function enemyFollower(def: number, atk = 2, name = "Enemy", idx = 0) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  c.can_attack = false;
  c.justPlayed = false;
  state.players.second.board.splice(idx, 0, c);
  return c;
}

describe("BUG 1 — super-evolved Galmieux counter-damage emits self_damaged", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("attack on own turn: passive fires once, crest adds Fangs, defense unchanged", () => {
    setupTurn(7, { hand: ["10344120"], pp: 9 });
    state.players.first.superEvoCharges = 1;
    whenPlayCard("first", 0);

    const galmieux = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Galmieux")),
    ).toBe(true);

    handleEvolveSelf(galmieux, "first", { mode: "super", spendPoint: true });
    const defBefore = Number(galmieux.defense);
    const handBefore = getHand(state, "first").length;

    const bystander = enemyFollower(3, 0, "Bystander", 0);
    const victim = enemyFollower(5, 5, "Victim", 1);

    galmieux.can_attack = true;
    galmieux.justPlayed = false;
    galmieux.attacks_left = 1;
    galmieux.hasAttacked = false;

    const atkIdx = getBoard(state, "first").indexOf(galmieux);
    attackFollower(atkIdx, 1, "first", "second");

    expect(Number(galmieux.defense)).toBe(defBefore);
    expect(Number(victim.defense)).toBeLessThanOrEqual(0);
    expect(Number(bystander.defense)).toBeLessThan(3);
    expect(
      getHand(state, "first").some((c) =>
        c.name?.includes("Fangs of Ardent Destruction"),
      ),
    ).toBe(true);
    expect(getHand(state, "first").length).toBe(handBefore + 1);
  });
});

describe("BUG 2 — Galmieux passive random hit ignores corpses mid-AoE", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fangs AoE: passive 3 damage kills surviving 5/2, never the dead 2/1 (seed 1786815074711)", () => {
    setupTurn(6, { hand: ["90044320"], pp: 9, seed: 1786815074711 });

    const galmieux = createCard("10344120", "board", "first");
    galmieux.peak_defense = galmieux.defense;
    state.players.first.board = [galmieux];

    const small = enemyFollower(1, 2, "Small", 0);
    const big = enemyFollower(2, 5, "Big", 1);

    whenPlayCard("first", 0);

    expect(Number(small.defense)).toBeLessThanOrEqual(0);
    expect(Number(galmieux.defense)).toBeLessThan(5);
    expect(Number(big.defense)).toBeLessThanOrEqual(0);
    expect(
      getBoard(state, "second").filter((c) => c && Number(c.defense) > 0),
    ).toHaveLength(0);
  });
});
