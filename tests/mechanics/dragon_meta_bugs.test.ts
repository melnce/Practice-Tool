/**
 * Regression tests for Dragon Meta live-play bugs (owner session).
 * Reproduce → fix → prove. Each bug has a dedicated describe block.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import {
  undo,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { runStartOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { handleRestore } from "../../src/logic/effects/ops/restore/index.js";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    activePlayer?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  givenGameState({
    seed: 42,
    activePlayer: opts.activePlayer ?? "first",
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

function poolUids(): string[] {
  const p = state.pendingTargetEffect;
  return (p?.poolUids ?? p?.pool?.map((c) => String(c.uid)) ?? []).map(String);
}

describe("BUG 1 — Galmieux crest adds Fangs when allied follower takes non-lethal damage", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    setHistoryEnabled(false);
  });

  it("crest trigger adds Fangs of Ardent Destruction to hand", () => {
    setupTurn(6, { hand: ["10344120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Galmieux")),
    ).toBe(true);

    const galmieux = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    const handBefore = getHand(state, "first").length;
    dealDamage(galmieux, 2, "second");

    expect(galmieux.defense).toBeGreaterThan(0);
    expect(
      getHand(state, "first").some((c) =>
        c.name?.includes("Fangs of Ardent Destruction"),
      ),
    ).toBe(true);
    expect(getHand(state, "first").length).toBe(handBefore + 1);
  });
});

describe("BUG 2 — Galmieux 3-damage passive undo determinism and alive-only targets", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    setHistoryEnabled(true);
    resetHistory();
  });

  it("attack → undo → same attack produces identical board (passive still fires)", () => {
    setupTurn(6, { hand: ["10344120"], pp: 5 });
    whenPlayCard("first", 0);
    const galmieux = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    const atkIdx = getBoard(state, "first").indexOf(galmieux);
    galmieux.can_attack = true;
    galmieux.justPlayed = false;
    galmieux.hasStorm = true;
    galmieux.attacks_left = 1;
    galmieux.hasAttacked = false;

    const victim = enemyFollower(2, 2, "Victim", 0);
    const bystander = enemyFollower(5, 0, "Bystander", 1);

    attackFollower(atkIdx, 0, "first", "second");
    const bystanderDefAfterFirst = Number(
      findOnBoard("second", "Bystander")!.defense,
    );
    const galmieuxDefAfterFirst = Number(
      findOnBoard("first", "Galmieux, Ardor Manifest")!.defense,
    );
    expect(bystanderDefAfterFirst).toBeLessThan(5);

    undo({ autoRender: false });

    expect(Number(findOnBoard("second", "Bystander")!.defense)).toBe(5);
    expect(
      Number(findOnBoard("first", "Galmieux, Ardor Manifest")!.defense),
    ).toBe(5);
    expect(getBoard(state, "second")).toHaveLength(2);

    const galmieuxAfterUndo = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    const atkIdxAfterUndo = getBoard(state, "first").indexOf(galmieuxAfterUndo);
    galmieuxAfterUndo.can_attack = true;
    galmieuxAfterUndo.attacks_left = 1;
    galmieuxAfterUndo.hasAttacked = false;

    attackFollower(atkIdxAfterUndo, 0, "first", "second");
    expect(Number(findOnBoard("second", "Bystander")!.defense)).toBe(
      bystanderDefAfterFirst,
    );
    expect(
      Number(findOnBoard("first", "Galmieux, Ardor Manifest")!.defense),
    ).toBe(galmieuxDefAfterFirst);
  });

  it("3-damage passive never hits a destroyed (0 def) follower still on board", () => {
    setupTurn(6, { hand: ["10344120"], pp: 5 });
    whenPlayCard("first", 0);
    const galmieux = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    const atkIdx = getBoard(state, "first").indexOf(galmieux);
    galmieux.can_attack = true;
    galmieux.justPlayed = false;
    galmieux.hasStorm = true;
    galmieux.attacks_left = 1;

    const victim = enemyFollower(2, 2, "Victim", 0);
    const bystander = enemyFollower(5, 0, "Bystander", 1);

    attackFollower(atkIdx, 0, "first", "second");
    expect(Number(bystander.defense)).toBeLessThan(5);
    expect(Number(victim.defense)).toBeLessThanOrEqual(0);
  });
});

describe("BUG 3 — Gilnelise evolve can target self; fanfare still excludes self", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    setHistoryEnabled(false);
  });

  it("evolve selection pool includes Gilnelise; fanfare pool excludes her", () => {
    setupTurn(6, { hand: ["10304120"], pp: 3 });
    allyFollower(4, 2, "Bystander");
    whenPlayCard("first", 0);

    const gil = findOnBoard("first", "Gilnelise, Voracity Manifest")!;
    expect(poolUids()).not.toContain(String(gil.uid));

    state.pendingTargetEffect = undefined;
    state.players.first.evo = 1;
    onEvolve(gil, "first", "normal");

    expect(poolUids()).toContain(String(gil.uid));
  });
});

describe("BUG 4 — Burnite Ash crest damage schedule", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    setHistoryEnabled(false);
  });

  function grantBurniteAshCrestToSecond() {
    setupTurn(10, { hand: ["10744110"], pp: 9 });
    state.players.first.superEvoCharges = 1;
    whenPlayCard("first", 0);
    const burnite = findOnBoard("first", "Burnite, Anathema of Ash")!;
    onEvolve(burnite, "first", "super");
    expect(
      getCrests(state, "second").some((c) =>
        c.name?.includes("Burnite, Anathema of Ash"),
      ),
    ).toBe(true);
  }

  it("crest owner loses only 2 HP at start of their turn, not on opponent turn start", () => {
    grantBurniteAshCrestToSecond();
    state.activePlayer = "first";
    const hpBefore = getHP(state, "second");

    runStartOfTurnBoundary("first");
    expect(getHP(state, "second")).toBe(hpBefore);

    runStartOfTurnBoundary("second");
    expect(getHP(state, "second")).toBe(hpBefore - 2);
  });

  it("Erntz heal at end of turn: 1 for restore only, no extra start-of-turn damage", () => {
    grantBurniteAshCrestToSecond();
    state.activePlayer = "second";
    state.players.second.hp = 10;
    const hpAtTurnStart = 10;

    runStartOfTurnBoundary("second");
    expect(getHP(state, "second")).toBe(hpAtTurnStart - 2);

    handleRestore(
      { op: "restore", target: "leader", player: "self", amount: 8 },
      "second",
      [],
      { owner: "second" },
    );
    expect(getHP(state, "second")).toBe(hpAtTurnStart - 2 - 1 + 8);

    const hpAfterHeal = getHP(state, "second");
    runStartOfTurnBoundary("first");
    expect(getHP(state, "second")).toBe(hpAfterHeal);

    runStartOfTurnBoundary("second");
    expect(getHP(state, "second")).toBe(hpAfterHeal - 2);
  });
});
