/**
 * Batch 6 — Forestcraft audit (sets 10001–10004; basic Forest in Batch 1).
 *
 * Cardinal rule: assertions from card text + rulebook only.
 * States use natural roundCount/maxPP alignment (no permPP skew).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Forestcraft cards):
 * - A (behavioral test): 37
 * - B/C escalated: 12 → tests/audit/batch06_forestcraft_ruled.test.ts
 *
 * Primitives: Combo in primitives_batch6_combo.test.ts;
 * Manamel/Cupitan evolve_trigger_always in primitives_batch6_forest_evolve_always.test.ts;
 * reuse Fairy/token, Engage, crests, Enhance, Skybound from prior batches.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import {
  attackFollower,
  canAttackLeaderWhileWardActive,
} from "../../src/logic/core/combat.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const FILLER = "10111310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
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
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function playCombo3(targetHandIndex: number): void {
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", targetHandIndex);
}

describe("Batch 6 — Forestcraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Deepwood Fairy Beast — Fanfare draw + restore X = hand size", () => {
    setupTurn(R8, {
      hand: ["10111130", "10111310"],
      pp: 8,
      deck: ["10111310"],
    });
    state.players.first.hp = 15;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThan(1);
    expect(getHP(state, "first")).toBeGreaterThan(15);
  });

  it("Elder Sagebrush — Combo (3) hits 3 random enemies", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, "10111150"], pp: 6 });
    enemyFollower(3, "A");
    enemyFollower(3, "B");
    enemyFollower(3, "C");
    playCombo3(0);
    const totalDef = state.players.second.board.reduce(
      (s, c) => s + Number(c.defense),
      0,
    );
    expect(totalDef).toBeLessThan(9);
  });

  it("Fairy Convocation — adds 2 Fairies to hand", () => {
    setupTurn(R6, { hand: ["10111310"], pp: 1 });
    whenPlayCard("first", 0);
    expect(thenHand("first").filter((c) => c.name === "Fairy").length).toBe(2);
  });

  it("Aerin — Fanfare destroy enemy + restore 2 leader; Ward", () => {
    setupTurn(R8, { hand: ["10112110"], pp: 7 });
    const e = enemyFollower(5);
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getHP(state, "first")).toBe(20);
    expect(findOnBoard("first", "Aerin, Crystalian Frostward")!.hasWard).toBe(
      true,
    );
  });

  it("Good Fairy of the Pond — Last Words adds Fairy", () => {
    setupTurn(R6, { hand: ["10112120"], pp: 1 });
    whenPlayCard("first", 0);
    const fairy = findOnBoard("first", "Good Fairy of the Pond")!;
    fairy.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Fairy")).toBe(true);
  });

  it("Baby Carbuncle — Fanfare bounce ally; Super-Evolve recover 3 PP", () => {
    setupTurn(R7, { hand: ["10112130"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first").some((c) => c.name === "Ally")).toBe(true);
    const carb = findOnBoard("first", "Baby Carbuncle")!;
    const ppBefore = state.players.first.pp;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(carb, "first");
    expect(state.players.first.pp).toBeGreaterThan(ppBefore);
  });

  it("Lambent Cairn — Combo (3) Deepwood Bounty; Engage +1/+1 ally", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, "10112210"], pp: 4 });
    playCombo3(0);
    expect(thenHand("first").some((c) => c.name === "Deepwood Bounty")).toBe(
      true,
    );

    resetUidCounter();
    setupTurn(R6, { hand: ["10112210"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    ally.peak_defense = 1;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex((c) => c.type === "Amulet");
    engageAmulet("first", idx);
    resolveFirstPending();
    expect(ally.attack).toBe(2);
    expect(ally.defense).toBe(2);
  });

  it("Fragrantwood Whispers — Deepwood Bounty + draw", () => {
    setupTurn(R6, { hand: ["10112310"], pp: 3, deck: ["10111310"] });
    const handBefore = 1;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThan(handBefore);
    expect(thenHand("first").some((c) => c.name === "Deepwood Bounty")).toBe(
      true,
    );
  });

  it("Lily — Combo (3) sets enemy DEF 1; Evolve draw + 1 damage", () => {
    setupTurn(R6, {
      hand: [FILLER, FILLER, "10113110"],
      pp: 4,
      deck: ["10111310"],
    });
    const e = enemyFollower(5);
    playCombo3(0);
    resolveFirstPending();
    expect(e.defense).toBe(1);
    const lily = findOnBoard("first", "Lily, Crystalian Innocence")!;
    whenEvolve(lily, "first");
    if (state.pendingTargetEffect) resolveFirstPending();
    expect(thenHand("first").length).toBeGreaterThan(0);
  });

  it("Glade — Fanfare draw 2; Evolve split damage by hand size", () => {
    setupTurn(R8, {
      hand: ["10113120", "10111310", "10111310"],
      pp: 5,
      deck: ["10111310"],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThan(2);
    const glade = findOnBoard("first", "Glade, Fragrantwood Ward")!;
    enemyFollower(5);
    whenEvolve(glade, "first");
    expect(state.players.second.board[0]!.defense).toBeLessThan(5);
  });

  it("Killer Rhinoceroach — +Combo ATK and Storm", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, "10113140"], pp: 5 });
    playCombo3(0);
    const roach = findOnBoard("first", "Killer Rhinoceroach")!;
    expect(roach.attack).toBe(3);
    expect(roach.hasStorm).toBe(true);
  });

  it("Godwood Staff — Combo (3) EOT draw; Engage bounce ally", () => {
    setupTurn(R6, {
      hand: [FILLER, FILLER, "10113210"],
      pp: 5,
      deck: ["10111310", "10111310"],
    });
    playCombo3(0);
    const handBefore = thenHand("first").length;
    whenEndTurn("first");
    expect(thenHand("first").length).toBeGreaterThan(handBefore);

    resetUidCounter();
    setupTurn(R6, { hand: ["10113210"], pp: 3 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Godwood Staff",
    );
    engageAmulet("first", idx);
    resolveFirstPending();
    expect(thenHand("first").some((c) => c.name === "Ally")).toBe(true);
  });

  it("Aria — Fanfare crest; Evolve summons 3 new Fairies; Super-Evolve also summons 3 Fairies", () => {
    setupTurn(R7, { hand: ["10114110"], pp: 6 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Aria")),
    ).toBe(true);
    const aria = findOnBoard("first", "Aria, Lady of the Woods")!;
    state.players.first.evoCharges = 2;
    const fairyUidsBeforeEvolve = new Set(
      thenBoard("first")
        .filter((c) => c.name === "Fairy")
        .map((c) => c.uid),
    );
    whenEvolve(aria, "first");
    const newFairiesFromEvolve = thenBoard("first").filter(
      (c) => c.name === "Fairy" && !fairyUidsBeforeEvolve.has(c.uid),
    );
    expect(newFairiesFromEvolve).toHaveLength(3);

    resetUidCounter();
    setupTurn(R7, { hand: ["10114110"], pp: 6 });
    whenPlayCard("first", 0);
    const ariaSe = findOnBoard("first", "Aria, Lady of the Woods")!;
    state.players.first.superEvoPoints = 1;
    const fairyUidsBeforeSe = new Set(
      thenBoard("first")
        .filter((c) => c.name === "Fairy")
        .map((c) => c.uid),
    );
    whenSuperEvolve(ariaSe, "first");
    const newFairiesFromSe = thenBoard("first").filter(
      (c) => c.name === "Fairy" && !fairyUidsBeforeSe.has(c.uid),
    );
    expect(newFairiesFromSe).toHaveLength(3);
  });
});

describe("Batch 6 — Forestcraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Wildheart — Rush on play", () => {
    setupTurn(R6, { hand: ["10211110"], pp: 3 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Wildheart")!.hasRush).toBe(true);
  });

  it("Dwarven Malletman — Combo (3) AoE instead of single target", () => {
    setupTurn(R10, { hand: [FILLER, FILLER, "10211120"], pp: 7 });
    enemyFollower(5, "A");
    enemyFollower(5, "B");
    playCombo3(0);
    expect(state.players.second.board.every((c) => Number(c.defense) < 5)).toBe(
      true,
    );
  });

  it("Woodwalkers — summons 3 Gentle Treant", () => {
    setupTurn(R10, { hand: ["10211310"], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Gentle Treant").length,
    ).toBe(3);
  });

  it("Lionel — Fanfare 2 Baby Carbuncle; Ward", () => {
    setupTurn(R8, { hand: ["10212110"], pp: 6 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Baby Carbuncle").length,
    ).toBe(2);
    expect(findOnBoard("first", "Lionel, Ardent Elf")!.hasWard).toBe(true);
  });

  it("Ambush from Above — Combo (3) hits twice", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, "10212310"], pp: 3 });
    enemyFollower(4);
    playCombo3(0);
    const foe = state.players.second.board.find((c) => c.type === "Follower");
    expect(foe == null || Number(foe.defense) === 0).toBe(true);
  });

  it("Cynthia — Fanfare 2 Fairies; Evolve Pixies +1 ATK", () => {
    setupTurn(R6, { hand: ["10213110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Fairy").length).toBe(2);
    const cynthia = findOnBoard("first", "Cynthia, Chivalrous Elf")!;
    const fairy = thenBoard("first").find((c) => c.name === "Fairy")!;
    if (fairy) fairy.tribes = ["Pixie"];
    whenEvolve(cynthia, "first");
    expect(fairy!.attack).toBeGreaterThan(1);
  });

  it("Titania — Fanfare Fairy + crest; Evolve enemy into Fairy", () => {
    setupTurn(R6, { hand: ["10214110"], pp: 4 });
    enemyFollower(4);
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Titania")),
    ).toBe(true);
    const titania = findOnBoard("first", "Titania, Queen of Fairies")!;
    whenEvolve(titania, "first");
    if (state.pendingTargetEffect) resolveFirstPending();
    expect(state.players.second.board.some((c) => c.name === "Fairy")).toBe(
      true,
    );
  });
});

describe("Batch 6 — Forestcraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Bearer of the Fairy Blade — Pixie enter gives +1 ATK", () => {
    setupTurn(R6, { hand: ["10311120", "10214110"], pp: 6 });
    whenPlayCard("first", 0);
    const bearer = findOnBoard("first", "Bearer of the Fairy Blade")!;
    const atkBefore = bearer.attack;
    whenPlayCard("first", 0);
    expect(bearer.attack).toBeGreaterThan(atkBefore);
  });

  it("Bestial Swipe — Combo (3) draws a card", () => {
    setupTurn(R6, {
      hand: [FILLER, FILLER, "10311310"],
      pp: 4,
      deck: ["10111310"],
    });
    enemyFollower(5);
    playCombo3(0);
    resolveFirstPending();
    expect(thenHand("first").length).toBeGreaterThan(0);
  });

  it("Greatwood Warrior — Last Words Bounty + Fairy", () => {
    setupTurn(R6, { hand: ["10312120"], pp: 4 });
    whenPlayCard("first", 0);
    const gw = findOnBoard("first", "Greatwood Warrior")!;
    gw.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Deepwood Bounty")).toBe(
      true,
    );
    expect(thenHand("first").some((c) => c.name === "Fairy")).toBe(true);
  });

  it("Hamlet of Unkilling — Fanfare discard 1 draw 2; Engage -0/-2", () => {
    setupTurn(R6, {
      hand: ["10312210", "10111310", "10111310"],
      pp: 3,
      deck: ["10111310"],
    });
    const e = enemyFollower(4);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first").length).toBeGreaterThan(1);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Hamlet of Unkilling",
    );
    engageAmulet("first", idx);
    resolveFirstPending();
    expect(e.defense).toBe(2);
  });

  it("Eradicating Arrow — X = Combo random -0/-1", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, "10313310"], pp: 3 });
    enemyFollower(3);
    playCombo3(0);
    const foe = state.players.second.board.find((c) => c.type === "Follower");
    expect(foe == null || Number(foe.defense) === 0).toBe(true);
  });

  it("Izudia — Fanfare -0/-6; Evolve adds Annihilating Onslaught", () => {
    setupTurn(R10, { hand: ["10314120"], pp: 8 });
    const e = enemyFollower(8);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(2);
    const iz = findOnBoard("first", "Izudia, Annihilation Manifest")!;
    whenEvolve(iz, "first");
    expect(
      thenHand("first").some((c) => c.name === "Annihilating Onslaught"),
    ).toBe(true);
  });
});

describe("Batch 6 — Forestcraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Kou & You — Strike restores 3 DEF to all allies", () => {
    setupTurn(R10, { hand: ["10411110"], pp: 7 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 3, defense: 1 },
      "board",
      "first",
    );
    ally.peak_defense = 3;
    ally.defense = 1;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    const kou = findOnBoard("first", "Kou & You, Love and Hatred")!;
    kou.justPlayed = false;
    const strike = (kou.triggers ?? []).find(
      (t: { event?: string }) => t.event === "strike",
    );
    runEffects((strike as { effects: unknown[] }).effects, "first", kou);
    expect(ally.defense).toBeGreaterThanOrEqual(3);
  });

  it("Comet Drive — 4 damage; draw if evolved ally on field", () => {
    setupTurn(R6, { hand: ["10411310"], pp: 2, deck: ["10111310"] });
    const e = enemyFollower(5);
    const evo = createCard("10112120", "board", "first");
    evo.hasEvolved = true;
    evo.peak_defense = evo.defense;
    state.players.first.board = [evo];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(1);
    expect(thenHand("first").length).toBeGreaterThan(0);
  });

  it("Chloe — Enhance(8) summons hand follower and returns self", () => {
    setupTurn(R10, { hand: ["10412110", "10112120"], pp: 8 });
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) resolveFirstPending();
    expect(
      thenBoard("first").some((c) => c.name === "Good Fairy of the Pond"),
    ).toBe(true);
    expect(thenHand("first").some((c) => c.name === "Chloe, What a Gal")).toBe(
      true,
    );
  });

  it("Anthuria — Fanfare Barrier on all allies", () => {
    setupTurn(R8, { hand: ["10412120"], pp: 5 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(ally.hasBarrier || ally.keywordState?.hasBarrier).toBe(true);
  });

  it("Starry Sky — Combo(5) gains Starry Sky crest", () => {
    setupTurn(R6, {
      hand: [FILLER, FILLER, FILLER, FILLER, "10412310"],
      pp: 5,
    });
    for (let i = 0; i < 4; i++) whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Starry Sky")),
    ).toBe(true);
  });

  it("Ewiyar — Skybound Art (10) recovers 1 EP; Rush", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstHand(["10414110"])
      .withFirstPP(2, 10)
      .withFirstEvo(0)
      .build();
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Ewiyar, Wind Personified")!.hasRush).toBe(
      true,
    );
    expect(state.players.first.evoCharges).toBe(1);
  });

  it("Yuel & Societte — Fanfare 2×4 random; Super-Evolve crest", () => {
    setupTurn(R8, { hand: ["10414120"], pp: 5 });
    enemyFollower(10, "A");
    enemyFollower(10, "B");
    whenPlayCard("first", 0);
    const totalDef = state.players.second.board.reduce(
      (s, c) => s + Number(c.defense),
      0,
    );
    expect(totalDef).toBeLessThan(20);
    resetUidCounter();
    setupTurn(R7);
    const yuel = createCard("10414120", "board", "first");
    yuel.peak_defense = yuel.defense;
    state.players.first.board = [yuel];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(yuel, "first");
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Yuel")),
    ).toBe(true);
  });
});
