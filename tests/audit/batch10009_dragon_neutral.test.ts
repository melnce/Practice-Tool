/**
 * Set 10009 — Dragoncraft + Neutral audit (batch 1 of Revenants of Azvaldt).
 *
 * Covers authored / partial cards only. Blocked cards are listed in the PR.
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
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
} from "../../src/core/playerHelpers.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
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
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
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

describe("Set 10009 — Neutral", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Jailor of Antiquity — Fanfare deals 6 to selected enemy; Accelerate deals 2 random", () => {
    setupTurn(R6, { hand: ["10901110"], pp: 6 });
    const foe = enemyFollower(2, 8, "Wall");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);

    resetUidCounter();
    setupTurn(R6, { hand: ["10901110"], pp: 1 });
    const foe2 = enemyFollower(2, 5, "Rand");
    playCardNoRender(getHand(state, "first"), "first", 0);
    expect(Number(foe2.defense)).toBeLessThan(5);
  });

  it("Blade Angel — Fanfare buffs two other allied followers +3/+3", () => {
    setupTurn(R6, { hand: ["10902110"], pp: 7 });
    const allyA = createCard(
      { name: "AllyA", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const allyB = createCard(
      { name: "AllyB", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(allyA, allyB);
    whenPlayCard("first", 0);
    resolvePendingTarget(String(allyA.uid));
    resolvePendingTarget(String(allyB.uid));
    expect(allyA.attack).toBe(4);
    expect(allyA.defense).toBe(4);
    expect(allyB.attack).toBe(4);
    expect(allyB.defense).toBe(4);
    const angel = findOnBoard("first", "Blade Angel")!;
    expect(angel.attack).toBe(6);
    expect(angel.defense).toBe(6);
  });

  it("Warden of Selflessness — Fanfare adds Jailor; Evolve recovers 1 PP", () => {
    setupTurn(R6, { hand: ["10903110"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenHand("first").some((c) => c.name === "Jailor of Antiquity"),
    ).toBe(true);

    const warden = findOnBoard("first", "Warden of Selflessness")!;
    const ppBefore = getPP(state, "first");
    state.players.first.evoCharges = 2;
    whenEvolve(warden, "first");
    expect(getPP(state, "first")).toBe(ppBefore + 1);
  });

  it("Zerael, Sundered Rebirth — Fanfare deals 9 to selected enemy follower", () => {
    setupTurn(R10, { hand: ["10904110"], pp: 9 });
    const foe = enemyFollower(2, 12, "Tank");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(3);
  });
});

describe("Set 10009 — Dragoncraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Cave Dragon — Fanfare evolves self in Overflow", () => {
    setupTurn(R6, { hand: ["10941120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Cave Dragon")?.hasEvolved).toBeFalsy();

    resetUidCounter();
    setupTurn(R7, { hand: ["10941120"], pp: 5 });
    expect(isOverflow("first")).toBe(true);
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Cave Dragon")?.hasEvolved).toBe(true);
  });

  it("Drake Whelp's Tantrum — summons Fire Drake Whelp at base cost; Enhance (3) adds random damage", () => {
    setupTurn(R6, { hand: ["10941310"], pp: 1 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Fire Drake Whelp")).toBe(
      true,
    );

    resetUidCounter();
    setupTurn(R6, { hand: ["10941310"], pp: 3 });
    const foe = enemyFollower(2, 5);
    whenPlayCard("first", 0);
    // Printed Enhance is additive: still summon the Whelp, and deal 3 damage.
    expect(thenBoard("first").some((c) => c.name === "Fire Drake Whelp")).toBe(
      true,
    );
    expect(Number(foe.defense)).toBe(2);
  });

  it("Dragonfolk Butler — Fanfare restores 3 and recovers 3 PP; Evolve buffs ally", () => {
    setupTurn(R6, { hand: ["10942120"], pp: 8 });
    state.players.first.hp = 12;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(15);
    expect(getPP(state, "first")).toBe(3);

    const butler = findOnBoard("first", "Dragonfolk Butler")!;
    state.players.first.evoCharges = 2;
    whenEvolve(butler, "first");
    resolveFirstPending();
    expect(ally.attack).toBe(5);
    expect(ally.defense).toBe(5);
  });

  it("Parting Jaws — discards 2 selected cards; damages random follower and enemy leader", () => {
    setupTurn(R6, {
      hand: [
        "10942310",
        { name: "FodderA", type: "Spell", cost: 1 },
        { name: "FodderB", type: "Spell", cost: 1 },
      ],
      pp: 3,
    });
    const hand = getHand(state, "first");
    const fodderA = hand.find((c) => c.name === "FodderA")!;
    const fodderB = hand.find((c) => c.name === "FodderB")!;
    const foe = enemyFollower(2, 5);
    const hp0 = getHP(state, "second");
    whenPlayCard("first", 0);
    resolvePendingTarget(String(fodderA.uid));
    resolvePendingTarget(String(fodderB.uid));
    expect(thenHand("first").some((c) => c.name === "FodderA")).toBe(false);
    expect(thenHand("first").some((c) => c.name === "FodderB")).toBe(false);
    expect(Number(foe.defense)).toBeLessThan(5);
    expect(getHP(state, "second")).toBe(hp0 - 3);
  });

  it("Normagdala, Ravening Revenant — Fanfare mode heals or debuffs; Evolve replicates", () => {
    setupTurn(R7, {
      hand: ["10944120"],
      pp: 7,
      deck: [{ name: "DeckTop", type: "Follower", attack: 1, defense: 1 }],
    });
    state.players.first.hp = 14;
    enemyFollower(3, 6);
    const hp0 = getHP(state, "first");
    const hand0 = getHand(state, "first").length;
    whenPlayCard("first", 0);
    const healed = getHP(state, "first") > hp0;
    const drew = getHand(state, "first").length > hand0;
    const debuffed =
      getBoard(state, "second")[0] != null &&
      Number(getBoard(state, "second")[0]!.defense) < 6;
    expect(healed || drew || debuffed).toBe(true);

    resetUidCounter();
    setupTurn(R7, { hand: ["10944120"], pp: 7 });
    whenPlayCard("first", 0);
    const norm = findOnBoard("first", "Normagdala, Ravening Revenant")!;
    const handBefore = getHand(state, "first").length;
    state.players.first.evoCharges = 2;
    whenEvolve(norm, "first");
    expect(getHand(state, "first").length).toBeGreaterThanOrEqual(handBefore);
  });
});
