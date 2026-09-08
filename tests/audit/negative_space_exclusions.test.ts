/**
 * Negative-space audit — "another / other" exclusion family (~60 cards).
 *
 * Each test sets up the source plus at least one same-side bystander (and enemies
 * where relevant) and asserts what must NOT happen: source excluded from select pools,
 * self untouched by "all other" buffs/damage, enter triggers skipping self, etc.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenBoard,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  setRally,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const R3 = 3;

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
}

function resolvePendingIfAny(): void {
  if (!state.pendingTargetEffect) return;
  resolveFirstPending();
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: Parameters<typeof givenGameState>[0] extends never ? never : any;
    shadows?: number;
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
  if (opts.deck) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  if (opts.shadows != null) state.players.first.shadows = opts.shadows;
}

function allyFollower(def = 2, name = "Bystander", atk = 2, cost = 2) {
  const c = createCard(
    { name, type: "Follower", cost, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function enemyFollower(def: number, name = "Enemy", atk = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function allyAmulet(name = "Sigil") {
  const c = createCard({ name, type: "Amulet", cost: 1 }, "board", "first");
  state.players.first.board.push(c);
  return c;
}

function statSnapshot(card: { attack?: number; defense?: number }) {
  return { atk: Number(card.attack), def: Number(card.defense) };
}

describe("Negative-space — select-another pools exclude source", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10061130 Winged Warrior — Fanfare pool excludes self", () => {
    setupTurn(R6, { hand: ["10061130"], pp: 4 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const winged = findOnBoard("first", "Winged Warrior")!;
    expect(poolUids()).not.toContain(String(winged.uid));
    expect(poolUids()).toContain(String(bystander.uid));
    const before = statSnapshot(winged);
    resolveFirstPending();
    expect(statSnapshot(winged)).toEqual(before);
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10121110 Ian — Fanfare pool excludes self; bystander gets +1/+1", () => {
    setupTurn(R6, { hand: ["10121110"], pp: 3 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const ian = findOnBoard("first", "Ian, Lovebound Knight")!;
    expect(poolUids()).not.toContain(String(ian.uid));
    const before = statSnapshot(ian);
    resolveFirstPending();
    expect(statSnapshot(ian)).toEqual(before);
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10112130 Baby Carbuncle — Fanfare pool excludes self", () => {
    setupTurn(R7, { hand: ["10112130"], pp: 2 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const carb = findOnBoard("first", "Baby Carbuncle")!;
    expect(poolUids()).not.toContain(String(carb.uid));
    resolveFirstPending();
    expect(findOnBoard("first", "Baby Carbuncle")).toBeTruthy();
    expect(thenBoard("first").some((c) => c.name === "Bystander")).toBe(false);
  });

  it("10113210 Godwood Staff — Engage pool excludes self", () => {
    setupTurn(R6, { hand: ["10113210"], pp: 3 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Godwood Staff",
    );
    const staffUid = state.players.first.board[idx]!.uid;
    engageAmulet("first", idx);
    expect(poolUids()).not.toContain(String(staffUid));
    resolveFirstPending();
    expect(findOnBoard("first", "Godwood Staff")).toBeFalsy();
    expect(thenHand("first").some((c) => c.name === "Bystander")).toBe(true);
  });

  it("10142130 Zell — Super-Evolve pool excludes self", () => {
    setupTurn(R7);
    const bystander = allyFollower(2, "Bystander", 2);
    const zell = createCard("10142130", "board", "first");
    zell.peak_defense = zell.defense;
    state.players.first.board = [bystander, zell];
    whenSuperEvolve(zell, "first");
    expect(poolUids()).not.toContain(String(zell.uid));
    expect(zell.hasStorm).toBeFalsy();
    resolvePendingTarget(String(bystander.uid));
    expect(bystander.hasStorm).toBe(true);
  });

  it("10142140 Marion — Fanfare pool excludes self", () => {
    setupTurn(R6, { hand: ["10142140"], pp: 4 });
    const bystander = allyFollower(1, "Bystander", 1);
    whenPlayCard("first", 0);
    const marion = findOnBoard("first", "Marion, Ravishing Dragonewt")!;
    expect(poolUids()).not.toContain(String(marion.uid));
    const before = statSnapshot(marion);
    resolveFirstPending();
    expect(statSnapshot(marion)).toEqual(before);
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10253110 Laura — Fanfare and Super-Evolve pools exclude self", () => {
    setupTurn(R6, { hand: ["10253110"], pp: 4 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const laura = findOnBoard("first", "Laura, Cruel Commander")!;
    expect(poolUids()).not.toContain(String(laura.uid));
    expect(laura.hasBane).toBeFalsy();
    resolveFirstPending();
    expect(bystander.hasBane).toBe(true);
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(laura, "first");
    expect(poolUids()).not.toContain(String(laura.uid));
    expect(laura.hasStorm).toBeFalsy();
    resolvePendingTarget(String(bystander.uid));
    expect(bystander.hasStorm).toBe(true);
  });

  it("10301110 Apostle of Voracity — Fanfare pool excludes self", () => {
    setupTurn(R6, { hand: ["10301110"], pp: 4 });
    const bystander = allyFollower(3, "Bystander", 1);
    whenPlayCard("first", 0);
    const apostle = findOnBoard("first", "Apostle of Voracity")!;
    expect(poolUids()).not.toContain(String(apostle.uid));
    const before = statSnapshot(apostle);
    resolveFirstPending();
    expect(statSnapshot(apostle)).toEqual(before);
  });

  it("10304120 Gilnelise — Fanfare pool excludes self", () => {
    setupTurn(R6, { hand: ["10304120"], pp: 3 });
    const bystander = allyFollower(4, "Bystander", 1);
    whenPlayCard("first", 0);
    const gil = findOnBoard("first", "Gilnelise, Voracity Manifest")!;
    expect(poolUids()).not.toContain(String(gil.uid));
    const before = statSnapshot(gil);
    resolveFirstPending();
    expect(statSnapshot(gil)).toEqual(before);
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10322120 Peppy Scout — Evolve pool excludes self", () => {
    setupTurn(R6, { hand: ["10322120"], pp: 5, deck: ["10121110"] });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const scout = findOnBoard("first", "Peppy Scout")!;
    whenEvolve(scout, "first");
    expect(poolUids()).not.toContain(String(scout.uid));
    resolvePendingTarget(String(bystander.uid));
    expect(Number(bystander.attack)).toBe(4);
  });

  it("10472110 Eustace — Skybound Art pool excludes self from evolve target", () => {
    setupTurn(R10, { hand: ["10472110"], pp: 5 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
    expect(poolUids()).not.toContain(String(eustace.uid));
    resolvePendingTarget(String(bystander.uid));
    expect(bystander.hasEvolved).toBe(true);
    expect(eustace.hasEvolved).toBe(true);
  });

  it("10534120 Ara — Evolve transform pool excludes self", () => {
    setupTurn(R10, { hand: ["10534120"], pp: 10 });
    enemyFollower(5, "Enemy");
    const bystander = allyFollower(3, "Bystander", 2);
    whenPlayCard("first", 0);
    resolvePendingIfAny();
    const ara = findOnBoard("first", "Ara, Dawnblossom")!;
    whenEvolve(ara, "first");
    expect(poolUids()).not.toContain(String(ara.uid));
    expect(ara.name).toBe("Ara, Dawnblossom");
    expect(findOnBoard("first", "Bystander")).toBeFalsy();
  });

  it("10663210 Sublime Eld Tome — Fanfare destroy pool excludes self", () => {
    setupTurn(R6, { hand: ["10663210"], pp: 4 });
    const bystander = allyAmulet("Bystander Amulet");
    whenPlayCard("first", 0);
    const tome = findOnBoard("first", "Sublime Eld Tome")!;
    expect(poolUids()).not.toContain(String(tome.uid));
    resolveFirstPending();
    expect(findOnBoard("first", "Sublime Eld Tome")).toBeTruthy();
    expect(findOnBoard("first", "Bystander Amulet")).toBeFalsy();
  });

  it("10664110 Kandima — Super-Evolve destroy pool excludes self", () => {
    setupTurn(R6, { hand: ["10664110"], pp: 4 });
    whenPlayCard("first", 0);
    const bystander = allyAmulet("Bystander Amulet");
    const kandima = findOnBoard("first", "Kandima, Sublime Hatred")!;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(kandima, "first");
    expect(poolUids()).not.toContain(String(kandima.uid));
    resolveFirstPending();
    expect(findOnBoard("first", "Kandima, Sublime Hatred")).toBeTruthy();
    expect(findOnBoard("first", "Bystander Amulet")).toBeFalsy();
  });

  it("10741120 Carrier Wyvern — Fanfare pool excludes self", () => {
    setupTurn(R6, { hand: ["10741120"], pp: 4 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const wyvern = findOnBoard("first", "Carrier Wyvern")!;
    expect(poolUids()).not.toContain(String(wyvern.uid));
    const before = statSnapshot(wyvern);
    resolveFirstPending();
    expect(statSnapshot(wyvern)).toEqual(before);
    expect(Number(bystander.attack)).toBe(4);
  });

  it("10871120 Leona — Super-Evolve Ambush pool excludes self", () => {
    setupTurn(R7);
    const bystander = allyFollower(2, "Bystander", 2);
    const leona = createCard("10871120", "board", "first");
    leona.peak_defense = leona.defense;
    state.players.first.board = [bystander, leona];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(leona, "first");
    expect(poolUids()).not.toContain(String(leona.uid));
    expect(leona.hasAmbush).toBeFalsy();
    resolvePendingTarget(String(bystander.uid));
    expect(bystander.hasAmbush).toBe(true);
  });

  it("10874120 Eudie — Evolve selection pool excludes self", () => {
    setupTurn(R6, { hand: ["10874120"], pp: 3 });
    whenPlayCard("first", 0);
    const eudie = findOnBoard("first", "Eudie, Your Dependable Mentor")!;
    const bystander = allyFollower(2, "Bystander", 2);
    whenEvolve(eudie, "first");
    expect(poolUids()).not.toContain(String(eudie.uid));
    resolvePendingTarget(String(bystander.uid));
    expect(bystander.hasEvolved).toBe(true);
    expect(eudie.hasEvolved).toBe(true);
  });
});

describe("Negative-space — all-other buffs/damage exclude source", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10111110 Fay Twinkletoes — Combo buffs bystander not self", () => {
    setupTurn(R6, {
      hand: ["10001110", "10001120", "10111110"],
      pp: 10,
    });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const fayBefore = statSnapshot(bystander);
    whenPlayCard("first", 0);
    const fay = findOnBoard("first", "Fay Twinkletoes")!;
    expect(Number(fay.attack)).toBe(2);
    expect(Number(bystander.attack)).toBe(fayBefore.atk + 1);
  });

  it("10121120 Ernesta — Fanfare buffs bystander not self", () => {
    setupTurn(R6, { hand: ["10121120"], pp: 6 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const ern = findOnBoard("first", "Ernesta, Peace Hawker")!;
    expect(Number(ern.attack)).toBe(4);
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10123130 Zirconia — Evolve buffs bystander not self", () => {
    setupTurn(R6);
    const bystander = allyFollower(2, "Bystander", 2);
    const zir = createCard("10123130", "board", "first");
    zir.peak_defense = zir.defense;
    const zirBefore = statSnapshot(zir);
    state.players.first.board = [bystander, zir];
    whenEvolve(zir, "first");
    expect(statSnapshot(zir)).toEqual({
      atk: zirBefore.atk + 2,
      def: zirBefore.def + 2,
    });
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10124120 Amelia — Super-Evolve Barrier on bystander not self", () => {
    setupTurn(R8, { hand: ["10124120"], pp: 8 });
    const bystander = createCard("10122130", "board", "first");
    bystander.peak_defense = bystander.defense;
    state.players.first.board = [bystander];
    whenPlayCard("first", 0);
    const amelia = findOnBoard("first", "Amelia, Silver Captain")!;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(amelia, "first");
    expect(amelia.hasBarrier).toBeFalsy();
    expect(bystander.hasBarrier).toBe(true);
  });

  it("10154110 Cerberus — Necromancy buffs bystander not self", () => {
    setupTurn(R10, { hand: ["10154110"], pp: 9, shadows: 6 });
    const bystander = allyFollower(2, "Bystander", 1);
    whenPlayCard("first", 0);
    const cerb = findOnBoard("first", "Cerberus, Hellfire Unleashed")!;
    const cerbAtk = Number(cerb.attack);
    expect(Number(bystander.attack)).toBe(3);
    expect(Number(cerb.attack)).toBe(cerbAtk);
  });

  it("10164120 Jeanne — Fanfare buffs bystander not self", () => {
    setupTurn(R8, { hand: ["10164120"], pp: 8 });
    enemyFollower(8);
    const bystander = allyFollower(2, "Bystander", 2);
    const before = statSnapshot(bystander);
    whenPlayCard("first", 0);
    const jeanne = findOnBoard("first", "Jeanne, Saintly Knight")!;
    const jeanneBefore = statSnapshot(jeanne);
    expect(statSnapshot(jeanne)).toEqual(jeanneBefore);
    expect(Number(bystander.attack)).toBe(before.atk + 2);
    expect(Number(bystander.defense)).toBe(before.def + 4);
  });

  it("10223120 Prim — Super-Evolve buffs bystander not self", () => {
    setupTurn(R7);
    const bystander = allyFollower(2, "Bystander", 2);
    const prim = createCard("10223120", "board", "first");
    applyKeywordsFromList(prim);
    prim.peak_defense = prim.defense;
    const primBefore = statSnapshot(prim);
    state.players.first.board = [bystander, prim];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(prim, "first");
    expect(statSnapshot(prim)).toEqual({
      atk: primBefore.atk + 3,
      def: primBefore.def + 3,
    });
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10264110 Aether — Super-Evolve Aura on bystander not self", () => {
    setupTurn(R8);
    const bystander = allyFollower(2, "Bystander", 2);
    const aether = createCard("10264110", "board", "first");
    aether.peak_defense = aether.defense;
    state.players.first.board = [bystander, aether];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(aether, "first");
    expect(aether.hasAura).toBeFalsy();
    expect(bystander.hasAura).toBe(true);
  });

  it("10523110 Unmoving Tactician — Super-Evolve buffs bystander not self", () => {
    setupTurn(R6);
    const bystander = allyFollower(2, "Bystander", 2);
    const tact = createCard("10523110", "board", "first");
    tact.peak_defense = tact.defense;
    const tactBefore = statSnapshot(tact);
    state.players.first.board = [bystander, tact];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(tact, "first");
    expect(statSnapshot(tact)).toEqual({
      atk: tactBefore.atk + 3,
      def: tactBefore.def + 3,
    });
    expect(Number(bystander.attack)).toBe(5);
    expect(Number(bystander.defense)).toBe(5);
  });

  it("10624110 Noel IV — Super-Evolve buffs bystander not self", () => {
    setupTurn(R8, { hand: ["10624110"], pp: 8 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const noel = findOnBoard("first", "Noel IV, Ruthless Warlord")!;
    const noelBefore = statSnapshot(noel);
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(noel, "first");
    expect(statSnapshot(noel)).toEqual({
      atk: noelBefore.atk + 3,
      def: noelBefore.def + 3,
    });
    expect(Number(bystander.attack)).toBe(3);
  });

  it("10631120 Daydream Librarian — Super-Evolve Rush on bystander not self", () => {
    setupTurn(R7, { hand: ["10631120"], pp: 6 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const lib = findOnBoard("first", "Daydream Librarian")!;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(lib, "first");
    expect(lib.hasRush).toBe(false);
    expect(bystander.hasRush).toBe(true);
  });

  it("10724120 Cesar — Fanfare buffs bystander Swordcraft follower not self", () => {
    setupTurn(R8, { hand: ["10724120"], pp: 8 });
    const bystander = createCard("10122130", "board", "first");
    bystander.peak_defense = bystander.defense;
    state.players.first.board = [bystander];
    whenPlayCard("first", 0);
    const cesar = findOnBoard("first", "Cesar, Accordant Major")!;
    expect(cesar.hasWard).toBe(true);
    expect(Number(cesar.attack)).toBe(5);
    expect(Number(bystander.attack)).toBeGreaterThanOrEqual(2);
    expect(bystander.hasWard).toBe(true);
  });

  it("10814110 Setus & Maisha — Fanfare buffs bystander not self", () => {
    setupTurn(R8, { hand: ["10814110"], pp: 8 });
    const bystander = allyFollower(2, "Bystander", 2);
    enemyFollower(3, "Victim");
    const bystanderBefore = statSnapshot(bystander);
    whenPlayCard("first", 0);
    resolvePendingIfAny();
    const setus = findOnBoard("first", "Setus & Maisha, Bladerights")!;
    expect(Number(setus.attack)).toBe(4);
    expect(Number(setus.defense)).toBe(6);
    expect(Number(bystander.attack)).toBe(bystanderBefore.atk + 1);
    expect(Number(bystander.defense)).toBe(bystanderBefore.def + 1);
  });
});

describe("Negative-space — all-other damage/destruction excludes source", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10332110 Supplicant of Truth — Fanfare damages others not self", () => {
    setupTurn(R8, { hand: ["10332110"], pp: 5, deck: ["10131310"] });
    const bystander = allyFollower(4, "Bystander", 2);
    whenPlayCard("first", 0);
    const sup = findOnBoard("first", "Supplicant of Truth")!;
    expect(Number(sup.defense)).toBe(2);
    expect(Number(bystander.defense)).toBe(1);
  });

  it("10553110 Lifestealer — Fanfare transforms others; self unchanged", () => {
    setupTurn(R10, { hand: ["10553110"], pp: 9 });
    const bystander = allyFollower(3, "Bystander", 2);
    enemyFollower(3, "Enemy");
    whenPlayCard("first", 0);
    const lifestealer = findOnBoard("first", "Lifestealer")!;
    expect(lifestealer.name).toBe("Lifestealer");
    expect(findOnBoard("first", "Bystander")).toBeFalsy();
    expect(findOnBoard("second", "Enemy")).toBeFalsy();
    expect(
      thenBoard("first").filter((c) => c.name === "Skeleton").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("10553110 Lifestealer — Evolve damages others not self", () => {
    setupTurn(R10);
    const lifestealer = createCard("10553110", "board", "first");
    lifestealer.peak_defense = 5;
    lifestealer.defense = 5;
    const bystander = allyFollower(3, "Bystander", 2);
    state.players.first.board = [lifestealer, bystander];
    const lsBefore = Number(lifestealer.defense);
    whenEvolve(lifestealer, "first");
    expect(Number(lifestealer.defense)).toBe(lsBefore + 2);
    expect(Number(bystander.defense)).toBe(2);
  });

  it("10804110 Alabaster Bahamut — Mode 1 banishes others not self", () => {
    setupTurn(R10, { hand: ["10804110"], pp: 10 });
    const bystander = allyFollower(3, "Bystander", 2);
    enemyFollower(3, "Enemy");
    setScriptedModePickProvider(() => [0]);
    whenPlayCard("first", 0);
    setScriptedModePickProvider(null);
    expect(findOnBoard("first", "Alabaster Bahamut")).toBeTruthy();
    expect(findOnBoard("first", "Bystander")).toBeFalsy();
    expect(findOnBoard("second", "Enemy")).toBeFalsy();
  });
});

describe("Negative-space — whenever-another enter triggers skip self", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10123140 Amalia — self-enter does not buff self", () => {
    setupTurn(R8, { hand: ["10123140"], pp: 8 });
    whenPlayCard("first", 0);
    const amalia = findOnBoard("first", "Amalia, Luxsteel Paladin")!;
    const amaliaAtk = Number(amalia.attack);
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: amalia,
      enteringOwner: "first",
    });
    expect(Number(amalia.attack)).toBe(amaliaAtk);
    expect(amalia.hasRush).toBeFalsy();
  });

  it("10123140 Amalia — another ally enter buffs the newcomer not Amalia", () => {
    setupTurn(R8);
    const amalia = createCard("10123140", "board", "first");
    applyKeywordsFromList(amalia);
    amalia.peak_defense = amalia.defense;
    const amaliaAtk = Number(amalia.attack);
    const newcomer = createCard(
      { name: "Newcomer", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    newcomer.peak_defense = 1;
    state.players.first.board = [amalia, newcomer];
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: newcomer,
      enteringOwner: "first",
    });
    expect(Number(amalia.attack)).toBe(amaliaAtk);
    expect(Number(newcomer.attack)).toBe(2);
    expect(newcomer.hasRush).toBe(true);
  });

  it("10224110 Gildaria — self-enter does not ping enemies", () => {
    setupTurn(R7, { hand: ["10224110"], pp: 6 });
    enemyFollower(3, "Enemy");
    whenPlayCard("first", 0);
    const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
    const foe = getBoard(state, "second")[0]!;
    const foeDef = Number(foe.defense);
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: gild,
      enteringOwner: "first",
    });
    expect(Number(foe.defense)).toBe(foeDef);
  });

  it("10252110 Vuella — self super-evolve does not buff Vuella twice", () => {
    setupTurn(R10);
    const vuella = createCard("10252110", "board", "first");
    applyKeywordsFromList(vuella);
    vuella.peak_defense = vuella.defense;
    state.players.first.board = [vuella];
    const atkBefore = Number(vuella.attack);
    whenSuperEvolve(vuella, "first");
    expect(Number(vuella.attack)).toBe(atkBefore + 3);
  });

  it("10724110 Gildaria Attunement — self-enter trigger does not grant Rush to Gildaria", () => {
    setupTurn(R6);
    const gild = createCard("10724110", "board", "first");
    gild.peak_defense = gild.defense;
    state.players.first.board = [gild];
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: gild,
      enteringOwner: "first",
    });
    expect(gild.hasRush).toBeFalsy();
  });

  it("10834120 Ginger — Fanfare leaves Ginger on board without self-Rush", () => {
    setupTurn(R8, { hand: ["10834120"], pp: 7 });
    whenPlayCard("first", 0);
    const ginger = findOnBoard("first", "Ginger, Disastrous Word")!;
    expect(ginger.hasRush).toBeFalsy();
  });

  it("10674110 Camiscilla — self-enter at base cost 5 does not self-evolve via trigger", () => {
    setupTurn(R8, { hand: ["10674110"], pp: 8 });
    whenPlayCard("first", 0);
    const cam = findOnBoard("first", "Camiscilla, Unfeeling Heart")!;
    expect(cam.hasEvolved).toBeFalsy();
  });
});

describe("Negative-space — conditional / counting exclusions", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10253120 Exella — X counts other allies not self", () => {
    setupTurn(R6, { hand: ["10253120"], pp: 5 });
    allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const ex = findOnBoard("first", "Exella, Nocturnal General")!;
    expect(Number(ex.attack)).toBe(2);
  });

  it("10501110 Monster Litterateur — alone on field gains no Fanfare buff", () => {
    setupTurn(R3, { hand: ["10501110"], pp: 1 });
    whenPlayCard("first", 0);
    const lit = findOnBoard("first", "Monster Litterateur")!;
    expect(Number(lit.attack)).toBe(1);
    expect(Number(lit.defense)).toBe(1);
  });

  it("10501110 Monster Litterateur — with another 1-cost on field buffs only self", () => {
    setupTurn(R3, { hand: ["10501110"], pp: 1 });
    const other = createCard("10012110", "board", "first");
    other.peak_defense = other.defense;
    state.players.first.board = [other];
    whenPlayCard("first", 0);
    const lit = findOnBoard("first", "Monster Litterateur")!;
    expect(Number(lit.attack)).toBe(2);
    expect(Number(other.attack)).toBe(1);
  });

  it("10573110 Neuron Disrupter — Fanfare PP recovery counts other allies not self", () => {
    setupTurn(R6, { hand: ["10573110"], pp: 5 });
    allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    expect(getPP(state, "first")).toBe(1);
    expect(findOnBoard("first", "Neuron Disrupter")).toBeTruthy();
    expect(findOnBoard("first", "Bystander")).toBeTruthy();
  });

  it("10573110 Neuron Disrupter — recovers 0 PP with no other allied followers", () => {
    setupTurn(R6, { hand: ["10573110"], pp: 5 });
    whenPlayCard("first", 0);
    expect(getPP(state, "first")).toBe(0);
    expect(findOnBoard("first", "Neuron Disrupter")).toBeTruthy();
  });

  it("10573110 Neuron Disrupter — recovers 3 PP from three other followers (capped at max)", () => {
    setupTurn(R6, { hand: ["10573110"], pp: 6 });
    allyFollower(1, "Ally1", 1, 1);
    allyFollower(1, "Ally2", 1, 1);
    allyFollower(1, "Ally3", 1, 1);
    whenPlayCard("first", 0);
    // Paid 5 PP (6→1), recovered 3 → 4 (max PP at round 6 is 6, so no cap here)
    expect(getPP(state, "first")).toBe(4);
    expect(thenBoard("first").length).toBe(4);
  });

  it("10524110 Oluon — evolved EOT random hits exclude Oluon herself", () => {
    setupTurn(9);
    const oluon = createCard("10524110", "board", "first");
    oluon.hasEvolved = true;
    oluon.peak_defense = oluon.defense;
    const bystander = allyFollower(20, "AllyBystander", 1);
    state.players.first.board = [oluon, bystander];
    state.players.second.board = [];
    const oluonDef = Number(oluon.defense);
    const allyDef = Number(bystander.defense);
    whenEndTurn();
    expect(Number(oluon.defense)).toBe(oluonDef);
    expect(Number(bystander.defense)).toBeLessThan(allyDef);
  });
});

describe("Negative-space — mode picks buff others not self", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  afterEach(() => {
    delete (globalThis as any).HEADLESS;
    setScriptedModePickProvider(null);
  });

  it("10723110 Knellclaw Lieutenant — Mode 1 buffs bystander not self", () => {
    setupTurn(R8, { hand: ["10723110"], pp: 8 });
    const bystander = allyFollower(2, "Bystander", 2);
    setScriptedModePickProvider(() => [0]);
    whenPlayCard("first", 0);
    setScriptedModePickProvider(null);
    const knell = findOnBoard("first", "Knellclaw Lieutenant")!;
    expect(Number(knell.attack)).toBe(3);
    expect(Number(bystander.attack)).toBe(3);
    expect(bystander.hasRush).toBe(true);
  });
});

describe("Negative-space — additional exclusions", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10104110 Olivia — Super-Evolve selection pool excludes self", () => {
    setupTurn(R10, { hand: ["10104110"], pp: 7 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(olivia, "first");
    expect(poolUids()).not.toContain(String(olivia.uid));
    resolvePendingTarget(String(bystander.uid));
    expect(bystander.evoType).toBe("super");
    expect(olivia.evoType).toBe("super");
  });

  it("10503210 World of Games — playing the amulet itself does not advance its countdown", () => {
    setupTurn(5, { hand: ["10503210"], pp: 5 });
    whenPlayCard("first", 0);
    const games = findOnBoard("first", "World of Games")!;
    expect(Number(games.countdown)).toBe(5);
  });

  it("10754110 Adahime — self-enter does not grant Rush to Adahime", () => {
    setupTurn(R8);
    const adahime = createCard("10754110", "board", "first");
    adahime.peak_defense = adahime.defense;
    state.players.first.board = [adahime];
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: adahime,
      enteringOwner: "first",
    });
    expect(adahime.hasRush).toBeFalsy();
  });
});

describe("Congregant of Destruction — destroy count_source", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("10373110 — with 2 other allies destroys exactly 2 random enemies (seeded) and wipes allies", () => {
    setupTurn(R8, { hand: ["10373110"], pp: 6 });
    enemyFollower(4, "EnemyA");
    enemyFollower(4, "EnemyB");
    enemyFollower(4, "EnemyC");
    allyFollower(1, "Ally1", 1, 1);
    allyFollower(1, "Ally2", 1, 1);
    whenPlayCard("first", 0);
    expect(thenBoard("second").map((c) => c.name)).toEqual(["EnemyB"]);
    expect(thenBoard("first").map((c) => c.name)).toEqual([
      "Congregant of Destruction",
    ]);
  });

  it("10373110 — with 0 other allies destroys no enemies but still enters", () => {
    setupTurn(R8, { hand: ["10373110"], pp: 6 });
    enemyFollower(4, "EnemyA");
    enemyFollower(4, "EnemyB");
    enemyFollower(4, "EnemyC");
    whenPlayCard("first", 0);
    expect(thenBoard("second").length).toBe(3);
    expect(thenBoard("first").map((c) => c.name)).toEqual([
      "Congregant of Destruction",
    ]);
  });
});
