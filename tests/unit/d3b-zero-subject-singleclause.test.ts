/**
 * Phase D3b — behaviour tests for the twenty-two single-clause zero-subject cards.
 * Titles name each card (id + printed clause) so the subjecthood analyzer records intent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
  whenEndTurn,
} from "../harness/builders.js";
import { whenEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import {
  getBoard,
  getHP,
  getHand,
  getCrests,
  getEvoCharges,
} from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 20 }, () => FILLER);

const PHILDAU = "10103110";
const AERIN = "10112110";
const ALBERT = "10124110";
const YUNA = "10152130";
const CERES = "10153110";
const MAINYU = "10161140";
const RONAVERO = "10163120";
const ELISE = "10171110";
const DIRK = "10171120";
const NOAH = "10172130";
const CHERETTA = "10202110";
const REINA_PARTNER = "10203110";
const ODIN = "10204110";
const GRIMNIR = "10204120";
const LIONEL = "10212110";
const SERIA = "10221110";
const RAYVN = "10251110";
const COLETTE = "10262110";
const ANTHURIA = "10412120";
const RESURRECTION_TUNER = "10572310";
const HAMSA = "10801110";
const REINA_WANDERER = "10801120";

const GHOST = "90051130";
const BAT = "90051120";
const PUPPET = "90071110";
const ENHANCED_PUPPET = "90071120";
const FORTIFIER_ARTIFACT = "90072120";
const GEAR_OF_REMEMBRANCE = "90071220";
const BABY_CARBUNCLE = "10112130";
const SERENE_SANCTUARY = "10161210";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    maxPP?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    seed?: number;
  } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b = b.withFirstDeck(opts.deck ?? PAD_DECK).withSecondDeck(PAD_DECK);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function allyFollower(
  atk: number,
  def: number,
  name = "Ally",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function hasBarrier(card: CardInstance): boolean {
  return !!(card.hasBarrier || card.keywordState?.hasBarrier);
}

describe("Phase D3b — zero-subject single-clause cards", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Phildau, Lionheart Ward (10103110) — Evolve destroys selected enemy follower (5/5 → off board)", () => {
    setupTurn(6, { hand: [PHILDAU], pp: 2, evo: 1 });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    const ph = findOnBoard("first", "Phildau, Lionheart Ward")!;
    whenEvolve(ph, "first");
    resolveFirstPending();
    expect(thenBoard("second").includes(foe)).toBe(false);
  }, 60_000);

  it("Aerin, Crystalian Frostward (10112110) — Fanfare destroys enemy and restores leader 2 HP (18 → 20)", () => {
    setupTurn(8, { hand: [AERIN], pp: 7 });
    enemyFollower(5, 5, "Foe");
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenBoard("second")).toHaveLength(0);
    expect(getHP(state, "first")).toBe(20);
    expect(findOnBoard("first", "Aerin, Crystalian Frostward")!.hasWard).toBe(
      true,
    );
  }, 60_000);

  it("Albert, Levin Stormsaber (10124110) — unenhanced play (5pp): no AoE, 1 attack per turn", () => {
    setupTurn(10, { hand: [ALBERT], pp: 5 });
    const a = enemyFollower(5, 5, "A");
    const b = enemyFollower(5, 5, "B");
    whenPlayCard("first", 0);
    const al = findOnBoard("first", "Albert, Levin Stormsaber")!;
    expect(Number(a.defense)).toBe(5);
    expect(Number(b.defense)).toBe(5);
    expect(al.attacks_per_turn ?? 1).toBe(1);
  }, 60_000);

  it("Albert, Levin Stormsaber (10124110) — Enhance (9): 3 damage to all enemies (5/5 → 5/2) and 2 attacks per turn", () => {
    setupTurn(10, { hand: [ALBERT], pp: 9 });
    const a = enemyFollower(5, 5, "A");
    const b = enemyFollower(5, 5, "B");
    whenPlayCard("first", 0);
    const al = findOnBoard("first", "Albert, Levin Stormsaber")!;
    expect(Number(a.defense)).toBe(2);
    expect(Number(b.defense)).toBe(2);
    expect(al.attacks_per_turn).toBe(2);
  }, 60_000);

  it("Yuna, Occult Hunter (10152130) — Last Words adds Ghost (90051130) and Bat (90051120) to hand", () => {
    setupTurn(6);
    const yuna = createCard(YUNA, "board", "first");
    applyKeywordsFromList(yuna);
    yuna.peak_defense = yuna.defense;
    state.players.first.board = [yuna];
    yuna.defense = 0;
    cleanupDead();
    const ids = thenHand("first").map((c) => c.id);
    expect(ids).toContain(GHOST);
    expect(ids).toContain(BAT);
  }, 60_000);

  it("Ceres, Blue Rose Maiden (10153110) — end of turn restores 2 leader HP (15 → 17)", () => {
    setupTurn(6);
    const ceres = createCard(CERES, "board", "first");
    applyKeywordsFromList(ceres);
    ceres.peak_defense = ceres.defense;
    state.players.first.board = [ceres];
    state.players.first.hp = 15;
    whenEndTurn();
    expect(getHP(state, "first")).toBe(17);
  }, 60_000);

  it("Ceres, Blue Rose Maiden (10153110) — super-evolved end of turn restores 4 HP (12 → 16) and gains Barrier", () => {
    setupTurn(6);
    const ceres = createCard(CERES, "board", "first");
    applyKeywordsFromList(ceres);
    ceres.peak_defense = ceres.defense;
    ceres.evoType = "super";
    ceres.hasEvolved = true;
    state.players.first.board = [ceres];
    state.players.first.hp = 12;
    whenEndTurn();
    expect(getHP(state, "first")).toBe(16);
    expect(hasBarrier(ceres)).toBe(true);
  }, 60_000);

  it("Mainyu, Darkdweller (10161140) — Engage amulet gives +1/+0 until end of turn (2 → 3 ATK, then back to 2)", () => {
    setupTurn(6, { hand: [SERENE_SANCTUARY], pp: 2 });
    const mainyu = createCard(MAINYU, "board", "first");
    applyKeywordsFromList(mainyu);
    mainyu.peak_defense = mainyu.defense;
    state.players.first.board = [mainyu];
    whenPlayCard("first", 0);
    expect(Number(mainyu.attack)).toBe(2);
    const amuletIdx = state.players.first.board.findIndex(
      (c) => c.type === "Amulet",
    );
    engageAmulet("first", amuletIdx);
    expect(Number(mainyu.attack)).toBe(3);
    whenEndTurn();
    expect(Number(mainyu.attack)).toBe(2);
  }, 60_000);

  it("Mainyu, Darkdweller (10161140) — without Engage: attack stays 2/2", () => {
    setupTurn(6, { hand: [SERENE_SANCTUARY], pp: 2 });
    const mainyu = createCard(MAINYU, "board", "first");
    applyKeywordsFromList(mainyu);
    mainyu.peak_defense = mainyu.defense;
    state.players.first.board = [mainyu];
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(Number(mainyu.attack)).toBe(2);
    expect(Number(mainyu.defense)).toBe(2);
  }, 60_000);

  it("Ronavero, Darkhaven Ward (10163120) — Evolve destroys selected enemy follower (4/4 → off board)", () => {
    setupTurn(6, { evo: 1 });
    const ron = createCard(RONAVERO, "board", "first");
    applyKeywordsFromList(ron);
    ron.peak_defense = ron.defense;
    enemyFollower(4, 4, "Foe");
    state.players.first.board = [ron];
    expect(ron.hasAmbush).toBe(true);
    whenEvolve(ron, "first");
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it("Elise, Electrifying Inventor (10171110) — Last Words adds Gear of Remembrance (90071220) to hand", () => {
    setupTurn(6, { hand: [ELISE], pp: 1 });
    whenPlayCard("first", 0);
    const elise = findOnBoard("first", "Elise, Electrifying Inventor")!;
    elise.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.id === GEAR_OF_REMEMBRANCE)).toBe(
      true,
    );
  }, 60_000);

  it("Dirk, Metal Mercenary (10171120) — Fanfare summons Fortifier Artifact (90072120)", () => {
    setupTurn(6, { hand: [DIRK], pp: 5 });
    whenPlayCard("first", 0);
    const fortifier = thenBoard("first").find(
      (c) => c.id === FORTIFIER_ARTIFACT,
    );
    expect(fortifier).toBeDefined();
    expect(fortifier!.uid).toBeTruthy();
  }, 60_000);

  it("Noah, Thread of Death (10172130) — Fanfare adds 3 Puppets (90071110) and +1/+0 to Puppetry in hand", () => {
    setupTurn(8, { hand: [NOAH, ENHANCED_PUPPET], pp: 6 });
    const ep = thenHand("first").find((c) => c.id === ENHANCED_PUPPET)!;
    const atk0 = Number(ep.attack);
    whenPlayCard("first", 0);
    expect(thenHand("first").filter((c) => c.id === PUPPET).length).toBe(3);
    expect(Number(ep.attack)).toBe(atk0 + 1);
  }, 60_000);

  it("Cheretta, Angelic Maid (10202110) — Fanfare without super-evolution unlock: stays 2/2", () => {
    setupTurn(5, { hand: [CHERETTA], pp: 2 });
    whenPlayCard("first", 0);
    const ch = findOnBoard("first", "Cheretta, Angelic Maid")!;
    expect(Number(ch.attack)).toBe(2);
    expect(Number(ch.defense)).toBe(2);
  }, 60_000);

  it("Cheretta, Angelic Maid (10202110) — Fanfare with super-evolution unlocked: +0/+3 (2/2 → 2/5)", () => {
    setupTurn(7, { hand: [CHERETTA], pp: 2 });
    whenPlayCard("first", 0);
    const ch = findOnBoard("first", "Cheretta, Angelic Maid")!;
    expect(Number(ch.attack)).toBe(2);
    expect(Number(ch.defense)).toBe(5);
  }, 60_000);

  it("Reina, Angelic Partner (10203110) — Evolve evolves all unevolved allied followers on field", () => {
    setupTurn(7, { hand: [REINA_PARTNER], pp: 7, evo: 1 });
    const a = allyFollower(2, 2, "AllyA");
    const b = allyFollower(2, 2, "AllyB");
    whenPlayCard("first", 0);
    const reina = findOnBoard("first", "Reina, Angelic Partner")!;
    state.players.first.evoCharges = 2;
    whenEvolve(reina, "first");
    expect(a.hasEvolved).toBe(true);
    expect(b.hasEvolved).toBe(true);
  }, 60_000);

  it("Odin, Twilit Fate (10204110) — Fanfare banishes selected enemy card (off board)", () => {
    setupTurn(7, { hand: [ODIN], pp: 7 });
    enemyFollower(4, 2, "Foe");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenBoard("second")).toHaveLength(0);
  }, 60_000);

  it("Grimnir, Heavenly Gale (10204120) — Fanfare gains Crest: Grimnir, Heavenly Gale", () => {
    setupTurn(6, { hand: [GRIMNIR], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Grimnir, Heavenly Gale",
      ),
    ).toBe(true);
  }, 60_000);

  it("Lionel, Ardent Elf (10212110) — Fanfare summons 2 Baby Carbuncle (10112130) with Ward", () => {
    setupTurn(8, { hand: [LIONEL], pp: 6 });
    whenPlayCard("first", 0);
    const carbuncles = thenBoard("first").filter(
      (c) => c.id === BABY_CARBUNCLE,
    );
    expect(carbuncles).toHaveLength(2);
    expect(findOnBoard("first", "Lionel, Ardent Elf")!.hasWard).toBe(true);
  }, 60_000);

  it("Seria, Gunslinger Maid (10221110) — Fanfare deals 1 damage to 2 random enemy followers (seed 17: 6/6 → 6/5 and 3/3 → 3/2)", () => {
    setupTurn(6, { hand: [SERIA], pp: 2, seed: 17 });
    const a = enemyFollower(6, 6, "A");
    const b = enemyFollower(3, 3, "B");
    whenPlayCard("first", 0);
    expect(Number(a.defense)).toBe(5);
    expect(Number(b.defense)).toBe(2);
  }, 60_000);

  it("Rayvn, the Silver Bullet (10251110) — Evolve destroys 2 enemies and deals 2 to your leader (20 → 18)", () => {
    setupTurn(6, { evo: 1 });
    const rayvn = createCard(RAYVN, "board", "first");
    rayvn.peak_defense = rayvn.defense;
    const e1 = enemyFollower(4, 4, "E1");
    const e2 = enemyFollower(4, 4, "E2");
    state.players.first.hp = 20;
    state.players.first.board = [rayvn];
    whenEvolve(rayvn, "first");
    resolvePendingByUid(String(e1.uid));
    resolvePendingByUid(String(e2.uid));
    expect(thenBoard("second")).toHaveLength(0);
    expect(getHP(state, "first")).toBe(18);
  }, 60_000);

  it("Colette, Barrage Exorcist (10262110) — Fanfare without 2 amulets: 1×2 random damage (seed 42: 4/4 → 4/2)", () => {
    setupTurn(6, { hand: [COLETTE], pp: 3, seed: 42 });
    const foe = enemyFollower(4, 4, "Foe");
    whenPlayCard("first", 0);
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);

  it("Colette, Barrage Exorcist (10262110) — Fanfare with 2+ allied amulets: 2×2 random damage (seed 42: total 8 → 4 defense lost)", () => {
    setupTurn(6, { hand: [COLETTE], pp: 3, seed: 42 });
    state.players.first.board = [
      createCard("10161210", "board", "first"),
      createCard("10162210", "board", "first"),
    ];
    enemyFollower(4, 4, "A");
    enemyFollower(3, 3, "B");
    const defBefore =
      Number(state.players.second.board[0]!.defense) +
      Number(state.players.second.board[1]!.defense);
    whenPlayCard("first", 0);
    const defAfter =
      Number(state.players.second.board[0]!.defense) +
      Number(state.players.second.board[1]!.defense);
    expect(defBefore - defAfter).toBe(4);
  }, 60_000);

  it("Anthuria, Toe-Tapping Torch (10412120) — Fanfare gives all allied followers Barrier (including self)", () => {
    setupTurn(8, { hand: [ANTHURIA], pp: 5 });
    const ally = allyFollower(2, 2, "Ally");
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    const anthuria = findOnBoard("first", "Anthuria, Toe-Tapping Torch")!;
    expect(hasBarrier(ally)).toBe(true);
    expect(hasBarrier(anthuria)).toBe(true);
  }, 60_000);

  it("Resurrection Tuner (10572310) — discards selected hand card and adds 2 destroyed allies (seed 73: 10002120 + 10002110)", () => {
    setupTurn(6, { hand: [RESURRECTION_TUNER, FILLER], pp: 1, seed: 73 });
    const deadA = createCard("10001110", "graveyard", "first");
    const deadB = createCard("10002110", "graveyard", "first");
    const deadC = createCard("10002120", "graveyard", "first");
    recordDestroyed(state, "first", deadA);
    recordDestroyed(state, "first", deadB);
    recordDestroyed(state, "first", deadC);
    whenPlayCard("first", 0);
    const discard = getHand(state, "first").find((c) => c.id === FILLER)!;
    resolvePendingByUid(discard.uid);
    const ids = handIds();
    expect(ids).not.toContain(FILLER);
    expect(ids).toContain("10002120");
    expect(ids).toContain("10002110");
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);

  it("Hamsa, Sculpted Divinity (10801110) — Evolve gives +5/+5 on top of evolve stats (1/1 → 8/8)", () => {
    setupTurn(5, { hand: [HAMSA], pp: 2, evo: 1 });
    whenPlayCard("first", 0);
    const hamsa = findOnBoard("first", "Hamsa, Sculpted Divinity")!;
    whenEvolve(hamsa, "first");
    expect(Number(hamsa.attack)).toBe(8);
    expect(Number(hamsa.defense)).toBe(8);
  }, 60_000);

  it("Hamsa, Sculpted Divinity (10801110) — control: Phildau normal evolve is +2/+2 only (2/2 → 4/4, not +5/+5)", () => {
    setupTurn(6, { hand: [PHILDAU], pp: 2, evo: 1 });
    whenPlayCard("first", 0);
    const ph = findOnBoard("first", "Phildau, Lionheart Ward")!;
    whenEvolve(ph, "first");
    expect(Number(ph.attack)).toBe(4);
    expect(Number(ph.defense)).toBe(4);
  }, 60_000);

  it("Reina, Timeless Wanderer (10801120) — Fanfare recovers 1 evolution point (0 → 1)", () => {
    setupTurn(5, { hand: [REINA_WANDERER], pp: 5 });
    state.players.first.evoCharges = 0;
    whenPlayCard("first", 0);
    expect(getEvoCharges(state, "first")).toBe(1);
  }, 60_000);

  it("Reina, Timeless Wanderer (10801120) — control: filler follower play does not recover EP (stays 0)", () => {
    setupTurn(5, { hand: [FILLER], pp: 1 });
    state.players.first.evoCharges = 0;
    whenPlayCard("first", 0);
    expect(getEvoCharges(state, "first")).toBe(0);
  }, 60_000);
});

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}
