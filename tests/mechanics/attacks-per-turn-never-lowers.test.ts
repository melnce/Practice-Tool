/**
 * @file Mechanic Contract: attacks-per-turn grants never lower a higher value.
 *
 * Official Q&A: Verdilia crest / Send 'Em Packing on super-evolved Armes (3 attacks)
 * must stay at 3. Lower grants use Math.max(current, n).
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
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const ARMES = "10654110";
const VERDILIA = "10864110";
const SEND_EM_PACKING = "90034350";
const R10 = 10;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
): void {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function enemyFollower(atk: number, def: number, name = "Wall") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  getBoard(state, "second").push(c);
  return c;
}

function prepareAttacker(card: ReturnType<typeof createCard>) {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = Number(card.attacks_per_turn ?? 1);
  applyKeywordsFromList(card);
}

function dispatchAttackFollower(
  attacker: { uid: string; attacks_used_this_turn?: number },
  defender: { uid: string; defense?: number | string },
): boolean {
  const usedBefore = attacker.attacks_used_this_turn ?? 0;
  const defBefore = Number(defender.defense);
  const idx = getBoard(state, "first").findIndex((c) => c.uid === attacker.uid);
  const defIdx = getBoard(state, "second").findIndex(
    (c) => c.uid === defender.uid,
  );
  attackFollower(idx, defIdx, "first", "second");
  const usedAfter = attacker.attacks_used_this_turn ?? 0;
  if (usedAfter > usedBefore) return true;
  return Number(defender.defense) < defBefore;
}

describe("Mechanic Contract: attacks-per-turn grants never lower", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("super-evolved Armes keeps 3 after Verdilia crest attack grant; three attacks then fourth refused", () => {
    setupTurn(R10, { hand: [ARMES], pp: 10 });
    const crestDef = getCardById(VERDILIA)!.superevolve![0] as any;
    handleGainCrest(crestDef, "first");
    whenPlayCard("first", 0);
    const armes = findOnBoard("first", "Armes, Depletive Demon")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(armes, "first", { mode: "super", spendPoint: true });
    expect(Number(armes.attacks_per_turn)).toBe(3);

    const wall = () =>
      enemyFollower(0, 30, `PunchingBag${state.rng.makeUid()}`);
    prepareAttacker(armes);

    expect(dispatchAttackFollower(armes, wall())).toBe(true);
    expect(Number(armes.attacks_per_turn)).toBe(3);
    expect(Number(armes.attacks_left)).toBe(2);

    expect(dispatchAttackFollower(armes, wall())).toBe(true);
    expect(Number(armes.attacks_left)).toBe(1);
    expect(dispatchAttackFollower(armes, wall())).toBe(true);
    expect(Number(armes.attacks_left)).toBe(0);
    expect(dispatchAttackFollower(armes, wall())).toBe(false);
  }, 60_000);

  it("Send 'Em Packing on super-evolved Armes leaves 3 attacks per turn", () => {
    setupTurn(R10, {
      hand: [ARMES, SEND_EM_PACKING],
      pp: 10,
    });
    whenPlayCard("first", 0);
    const armes = findOnBoard("first", "Armes, Depletive Demon")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(armes, "first", { mode: "super", spendPoint: true });
    expect(Number(armes.attacks_per_turn)).toBe(3);

    whenPlayCard("first", 0);
    resolvePendingTarget(armes.uid);
    expect(Number(armes.attacks_per_turn)).toBe(3);
  }, 60_000);

  it("Send 'Em Packing on a plain 1-attack follower grants 2", () => {
    setupTurn(R10, { hand: [SEND_EM_PACKING], pp: 1 });
    const ally = createCard(
      { name: "Plain", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    getBoard(state, "first").push(ally);

    whenPlayCard("first", 0);
    resolvePendingTarget(ally.uid);
    expect(Number(ally.attacks_per_turn)).toBe(2);
  }, 60_000);

  it("end of turn does not restore super-evolved Armes below 3 after crest attack grant", () => {
    setupTurn(R10, { hand: [ARMES], pp: 10 });
    const crestDef = getCardById(VERDILIA)!.superevolve![0] as any;
    handleGainCrest(crestDef, "first");
    whenPlayCard("first", 0);
    const armes = findOnBoard("first", "Armes, Depletive Demon")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(armes, "first", { mode: "super", spendPoint: true });

    const wall = enemyFollower(0, 30, "PunchingBag");
    prepareAttacker(armes);
    dispatchAttackFollower(armes, wall);
    expect(Number(armes.attacks_per_turn)).toBe(3);

    runEndOfTurnBoundary("first");
    expect(Number(armes.attacks_per_turn)).toBe(3);
  }, 60_000);
});
