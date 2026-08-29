/**
 * Set 10009 — tokens unblocked by Basic A ingest (Flag, Warden, Trap amulet).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import "../../src/logic/core/effects/index.js";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const SPELL_FILLER = "10111310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    active?: "first" | "second";
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
  state.players.second.board.push(c);
  return c;
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("Set 10009 — Flag token unblocked", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Open-Sea Scout — Fanfare summons Dread Pirate's Flag", () => {
    setupTurn(R5, { hand: ["10921110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Dread Pirate's Flag"),
    ).toBe(true);
  });

  it("Whirlpool Gunner — Fanfare summons Dread Pirate's Flag", () => {
    setupTurn(R6, { hand: ["10922110"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Dread Pirate's Flag"),
    ).toBe(true);
  });

  it("L'Age d'Or — summons Dread Pirate's Flag", () => {
    setupTurn(R6, { hand: ["10923310"], pp: 4 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Dread Pirate's Flag"),
    ).toBe(true);
  });

  it("Barbaros — advances allied Dread Pirate's Flag countdown by 5", () => {
    setupTurn(R8, { hand: ["10924110"], pp: 7 });
    whenPlayCard("first", 0);
    const flag = findOnBoard("first", "Dread Pirate's Flag")!;
    expect(flag.countdown).toBe(2);
  });

  it("Dread Pirate's Flag — spell play advances countdown; Last Words deals 2", () => {
    setupTurn(R6, { hand: ["10921110", SPELL_FILLER, SPELL_FILLER], pp: 4 });
    whenPlayCard("first", 0);
    const flag = findOnBoard("first", "Dread Pirate's Flag")!;
    expect(flag.countdown).toBe(7);
    whenPlayCard("first", 1);
    expect(flag.countdown).toBe(6);
    const hp0 = getHP(state, "second");
    flag.countdown = 1;
    whenPlayCard("first", 0);
    cleanupDead();
    expect(
      thenBoard("first").some((c) => c.name === "Dread Pirate's Flag"),
    ).toBe(false);
    expect(getHP(state, "second")).toBe(hp0 - 2);
  });
});

describe("Set 10009 — Trap in the Woods (amulet)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Trap in the Woods — enemy follower enter destroys it and the trap", () => {
    setupTurn(R6, { hand: ["10911210"], pp: 3 });
    whenPlayCard("first", 0);
    const trap = findOnBoard("first", "Trap in the Woods")!;
    const foe = enemyFollower(2, 5);
    const enterTrig = trap.triggers![0]!;
    runEffects(
      (enterTrig as { effects: unknown[] })
        .effects as import("../../src/core/types/index.js").Effect[],
      "first",
      trap,
      { enteringCard: foe },
    );
    cleanupDead();
    expect(getBoard(state, "second").length).toBe(0);
    expect(thenBoard("first").some((c) => c.name === "Trap in the Woods")).toBe(
      false,
    );
  });
});

describe("Set 10009 — Aizeden + Warden of the Trigger", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Aizeden — Fanfare summons Warden of the Trigger", () => {
    setupTurn(R8, { hand: ["10974120"], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Warden of the Trigger"),
    ).toBe(true);
  });

  it("Aizeden — allied Artifact enter destroys random enemy follower", () => {
    setupTurn(R8, { hand: ["10974120"], pp: 10 });
    enemyFollower(3, 5, "Victim");
    whenPlayCard("first", 0);
    const artifact = createCard(
      {
        id: "90074110",
        name: "Mystic Artifact",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        tribes: ["Artifact"],
      },
      "hand",
      "first",
    );
    state.players.first.hand.push(artifact);
    whenPlayCard("first", 0);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("Warden of the Trigger — Last Words restores 2 leader HP", () => {
    setupTurn(R6, { hand: ["10974120"], pp: 7 });
    state.players.first.hp = 15;
    whenPlayCard("first", 0);
    const warden = findOnBoard("first", "Warden of the Trigger")!;
    warden.defense = 0;
    cleanupDead();
    expect(getHP(state, "first")).toBe(17);
  });
});
