/**
 * attacks_per_turn budget — stat path (Knightly Ardor) must match attacks_per_turn op path.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  redo,
  resetHistory,
  setHistoryEnabled,
  undo,
} from "../../src/core/history.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  getLegalSoakActions,
  canonicalJson,
} from "../../src/bench/soakEnv.js";
import { recomputeAttackFlags } from "../../src/logic/core/combat.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import "../../src/logic/core/effects/index.js";

const KNIGHTLY_ARDOR = "10423310";
const SWORD_LEFT = "10022110"; // Royal Coachwoman (Swordcraft)
const FILLER = "10111310";
const R6 = 6;

function captureAttackLegality(): string {
  return canonicalJson(
    getLegalSoakActions()
      .filter((a) => a.type === "ATTACK")
      .map((a) => ({
        type: "ATTACK" as const,
        player: a.player,
        attackerUid: a.attackerUid,
        defender: a.defender,
      }))
      .sort((a, b) =>
        `${a.attackerUid}:${JSON.stringify(a.defender)}`.localeCompare(
          `${b.attackerUid}:${JSON.stringify(b.defender)}`,
        ),
      ),
  );
}

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
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(pp, max)
    .withSecondPP(max, max)
    .withSecondDeck(Array(10).fill(FILLER));
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
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

function swordFollower(extra: Record<string, unknown> = {}) {
  const c = createCard(SWORD_LEFT, "board", "first");
  c.peak_defense = c.defense;
  c.justPlayed = false;
  c.attacks_per_turn = 1;
  c.attacks_left = 1;
  c.attacks_used_this_turn = 0;
  c.hasAttacked = false;
  Object.assign(c, extra);
  recomputeAttackFlags(c);
  getBoard(state, "first").push(c);
  return c;
}

function playKnightlyArdorMode1(): void {
  setScriptedModePickProvider(() => [0]);
  whenPlayCard("first", 0);
  setScriptedModePickProvider(null);
}

function dispatchAttackFollower(
  attacker: { uid: string; attacks_used_this_turn?: number },
  defender: { uid: string; defense?: number | string },
): boolean {
  const usedBefore = attacker.attacks_used_this_turn ?? 0;
  const defBefore = Number(defender.defense);
  engineDispatch(state, {
    type: "ATTACK",
    player: "first",
    attackerUid: attacker.uid,
    defender: { type: "follower", uid: defender.uid },
  });
  const usedAfter = attacker.attacks_used_this_turn ?? 0;
  if (usedAfter > usedBefore) return true;
  return Number(defender.defense) < defBefore;
}

function dispatchAttackLeader(attacker: { uid: string }): boolean {
  const hpBefore = getHP(state, "second");
  engineDispatch(state, {
    type: "ATTACK",
    player: "first",
    attackerUid: attacker.uid,
    defender: { type: "leader", player: "second" },
  });
  return getHP(state, "second") < hpBefore;
}

function grantAttacksPerTurnOp(
  follower: { uid: string; name?: string },
  n = 2,
): void {
  const card = findOnBoard("first", follower.name!)!;
  whenRunEffects([{ op: "attacks_per_turn", value: n }], "first", card);
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("attacks_per_turn budget — Knightly Ardor stat path", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    installSoakAdapter({ interactiveModes: false });
  });

  it("un-attacked leftmost Swordcraft ally: two ATTACK dispatches succeed, third refused", () => {
    setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5 });
    const ally = swordFollower();
    const wall = enemyFollower(0, 20);

    playKnightlyArdorMode1();
    expect(ally.attacks_per_turn).toBe(2);
    expect(ally.attacks_left).toBe(2);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(ally.attacks_left).toBe(1);
    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(ally.attacks_left).toBe(0);
    expect(dispatchAttackFollower(ally, wall)).toBe(false);
  });

  it("ally that attacked once: Knightly Ardor grants exactly one more attack", () => {
    setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5 });
    const ally = swordFollower();
    const wall = enemyFollower(0, 20);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(ally.attacks_used_this_turn).toBe(1);
    expect(ally.attacks_left).toBe(0);

    playKnightlyArdorMode1();
    expect(ally.attacks_per_turn).toBe(2);
    expect(ally.attacks_left).toBe(1);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(ally.attacks_left).toBe(0);
    expect(dispatchAttackFollower(ally, wall)).toBe(false);
  });

  it("Rush ally played this turn that attacked once: grant allows one follower attack, not leader", () => {
    setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5 });
    const ally = swordFollower({
      justPlayed: true,
      hasRush: true,
      attacks_left: 0,
      attacks_used_this_turn: 1,
      hasAttacked: true,
    });
    const wall = enemyFollower(0, 20);

    playKnightlyArdorMode1();
    expect(ally.attacks_left).toBe(1);
    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(ally.attacks_left).toBe(0);
    expect(dispatchAttackFollower(ally, wall)).toBe(false);
    expect(dispatchAttackLeader(ally)).toBe(false);
  });

  it("undo/redo around Knightly Ardor keeps legal ATTACK list identical", () => {
    setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5 });
    swordFollower();
    enemyFollower(0, 20);

    playKnightlyArdorMode1();
    const legalAfterGrant = captureAttackLegality();

    engineDispatch(state, { type: "END_TURN", player: "first" });
    const legalAfterEnd = captureAttackLegality();

    undo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterGrant);
    redo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterEnd);
  });
});

describe("attacks_per_turn budget — attacks_per_turn op path", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    installSoakAdapter({ interactiveModes: false });
  });

  it("un-attacked ally: two ATTACK dispatches succeed, third refused", () => {
    setupTurn(R6);
    const ally = swordFollower({ name: "BudgetAlly" });
    const wall = enemyFollower(0, 20);

    grantAttacksPerTurnOp(ally);
    expect(ally.attacks_per_turn).toBe(2);
    expect(ally.attacks_left).toBe(2);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(dispatchAttackFollower(ally, wall)).toBe(false);
  });

  it("ally that attacked once: op grant allows exactly one more attack", () => {
    setupTurn(R6);
    const ally = swordFollower({ name: "BudgetAlly" });
    const wall = enemyFollower(0, 20);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    grantAttacksPerTurnOp(ally);
    expect(ally.attacks_left).toBe(1);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(dispatchAttackFollower(ally, wall)).toBe(false);
  });

  it("Rush ally played this turn that attacked once: op grant allows one follower attack, not leader", () => {
    setupTurn(R6);
    const ally = swordFollower({
      name: "BudgetAlly",
      justPlayed: true,
      hasRush: true,
      attacks_left: 0,
      attacks_used_this_turn: 1,
      hasAttacked: true,
    });
    const wall = enemyFollower(0, 20);

    grantAttacksPerTurnOp(ally);
    expect(ally.attacks_left).toBe(1);
    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(dispatchAttackFollower(ally, wall)).toBe(false);
    expect(dispatchAttackLeader(ally)).toBe(false);
  });
});
