/**
 * @file Mechanic Contract: sequence abilities wrap after the last step.
 *
 * Official Q&A: Omerio, Winged Revenant — after the third ability fires,
 * the next allied amulet destruction activates step 1 again.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const OMERIO = "10964120";
const AMULET_A = "10161210";
const R8 = 8;

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

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  getBoard(state, "second").push(c);
  return c;
}

function allyAmulet(name: string) {
  const c = createCard(AMULET_A, "board", "first");
  c.name = name;
  applyKeywordsFromList(c);
  getBoard(state, "first").push(c);
  return c;
}

describe("Mechanic Contract: sequence abilities wrap", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Omerio — four amulet destroys: damage, restore, Holy Falcon, damage again", () => {
    setupTurn(R8, { hand: [OMERIO], pp: 6 });
    whenPlayCard("first", 0);

    const foes = [
      enemyFollower(2, 6, "F1"),
      enemyFollower(2, 6, "F2"),
      enemyFollower(2, 6, "F3"),
    ];
    state.players.first.hp = 10;

    const amulets = ["T1", "T2", "T3", "T4"].map((n) => allyAmulet(n));

    destroyTarget(amulets[0]!, "first");
    cleanupDead();
    const defAfter1 = foes.reduce((s, f) => s + Number(f.defense), 0);
    expect(defAfter1).toBeLessThan(18);

    destroyTarget(amulets[1]!, "first");
    cleanupDead();
    expect(getHP(state, "first")).toBe(12);

    destroyTarget(amulets[2]!, "first");
    cleanupDead();
    expect(thenBoard("first").some((c) => c.name === "Holy Falcon")).toBe(true);

    const defBefore4 = foes.reduce((s, f) => s + Number(f.defense), 0);
    destroyTarget(amulets[3]!, "first");
    cleanupDead();
    const defAfter4 = foes.reduce((s, f) => s + Number(f.defense), 0);
    expect(defBefore4 - defAfter4).toBeGreaterThan(0);
  }, 60_000);
});
