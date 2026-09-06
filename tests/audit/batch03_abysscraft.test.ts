/**
 * Batch 3 — Abysscraft audit (sets 10001–10004; basic set in Batch 1).
 *
 * Cardinal rule: assertions from card text + rulebook only.
 * States use natural roundCount/maxPP/permPP alignment (no permPP skew).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Abysscraft cards):
 * - A (behavioral test): 44 (5 currently red — see llm-guide)
 * - B/C escalated: 5 cards (ruled file + red queue)
 * - B/C escalated → tests/audit/batch03_abysscraft_ruled.test.ts + llm-guide red queue
 *
 * Primitives reused: Necromancy (§757), Reanimate (§763), banish/no shadow (§154–160),
 *   zero-damage instances, numeric stats at load, replicate, Engage, Enhance, crest countdown.
 * New in primitives_batch1: consolidated shadow fuel (destroy / spell / discard vs banish / transform).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  whenRunEffects,
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
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
  getShadows,
} from "../../src/core/playerHelpers.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R9 = 9;
const R10 = 10;
const R15 = 15;

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
    grave?: ReturnType<typeof createCard>[];
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
  if (opts.shadows !== undefined) b = b.withFirstShadows(opts.shadows);
  b.build();
  if (opts.grave?.length) state.players.first.graveyard.push(...opts.grave);
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

describe("Batch 3 — Abysscraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Aryll — Fanfare summons Bat; another allied Bat enter gains Storm and pings leader", () => {
    setupTurn(R6, { hand: ["10151110"], pp: 4 });
    whenPlayCard("first", 0);
    const firstBat = findOnBoard("first", "Bat");
    expect(firstBat).toBeTruthy();

    state.players.first.hp = 20;
    runEffects(
      [{ op: "summon", source: "named", name: "Bat", count: 1 } as any],
      "first",
      findOnBoard("first", "Aryll, Moonstruck Vampire")!,
    );
    const bats = thenBoard("first").filter((c) => c.name === "Bat");
    expect(bats.some((b) => b.hasStorm)).toBe(true);
    expect(getHP(state, "first")).toBe(19);
  });

  it("Nameless Demon — Evolve summons 2 Bats", () => {
    setupTurn(R6);
    const demon = createCard("10151120", "board", "first");
    demon.peak_defense = demon.defense;
    state.players.first.board = [demon];
    whenEvolve(demon, "first");
    expect(thenBoard("first").filter((c) => c.name === "Bat").length).toBe(2);
  });

  it("Little Miss Bonemancer — Last Words summons 2 Skeletons", () => {
    setupTurn(R6);
    const bone = createCard("10151130", "board", "first");
    applyKeywordsFromList(bone);
    bone.defense = 0;
    state.players.first.board = [bone];
    cleanupDead();
    expect(countSkeletons()).toBe(2);
  });

  it("Ghost Juggler — Fanfare Reanimate (4) from graveyard", () => {
    setupTurn(R8, { hand: ["10151140"], pp: 7 });
    const corpse = createCard("10151130", "graveyard", "first");
    state.players.first.graveyard.push(corpse);
    recordDestroyed(state, "first", corpse);
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Little Miss Bonemancer"),
    ).toBe(true);
  });

  it("Darkseal Demon — Fanfare draw 2 and 2 damage to your leader; Evolve 6 to selected enemy", () => {
    setupTurn(R6, {
      hand: ["10151150"],
      pp: 6,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    state.players.first.hp = 20;
    const e = enemyFollower(8);
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(2);
    expect(getHP(state, "first")).toBe(18);

    const demon = findOnBoard("first", "Darkseal Demon")!;
    whenEvolve(demon, "first");
    resolveFirstPending();
    expect(e.defense).toBe(2);
  });

  it("Reaper's Deathslash — destroys 1 allied and 1 enemy follower", () => {
    setupTurn(R6, { hand: ["10151310"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    const e = enemyFollower(2);
    whenPlayCard("first", 0);
    resolveFirstPending();
    resolveFirstPending();
    expect(getBoard(state, "first")).toHaveLength(0);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Mino — Enhance (4) grants Rush and Bane; Last Words adds Skeleton to hand", () => {
    setupTurn(R6, { hand: ["10152110"], pp: 6 });
    whenPlayCard("first", 0);
    const mino = findOnBoard("first", "Mino, Shrewd Reaper")!;
    expect(mino.hasRush).toBe(true);
    expect(mino.hasBane).toBe(true);
    mino.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Skeleton")).toBe(true);
  });

  it("Beryl — Fanfare 3 damage to your leader; Evolve restores 5", () => {
    setupTurn(R6, { hand: ["10152120"], pp: 3 });
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(17);

    const beryl = findOnBoard("first", "Beryl, Nightmare Incarnate")!;
    whenEvolve(beryl, "first");
    expect(getHP(state, "first")).toBe(20);
  });

  it("Yuna — Last Words adds Ghost and Bat to hand", () => {
    setupTurn(R6);
    const yuna = createCard("10152130", "board", "first");
    applyKeywordsFromList(yuna);
    yuna.defense = 0;
    state.players.first.board = [yuna];
    cleanupDead();
    const names = thenHand("first").map((c) => c.name);
    expect(names).toContain("Ghost");
    expect(names).toContain("Bat");
  });

  it("Vlad — Fanfare 5 damage to selected enemy and restore 5 to your leader", () => {
    setupTurn(R8, { hand: ["10152140"], pp: 8 });
    const e = enemyFollower(6);
    state.players.first.hp = 12;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(1);
    expect(getHP(state, "first")).toBe(17);
  });

  it("Shadowcrypt Memorial — Fanfare +2 shadows; Engage summons 2 Ghosts", () => {
    setupTurn(R6, { hand: ["10152210"], pp: 4 });
    whenPlayCard("first", 0);
    expect(getShadows(state, "first")).toBe(2);
    const memorial = findOnBoard("first", "Shadowcrypt Memorial")!;
    engageAmulet("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Ghost").length).toBe(2);
  });

  it("Ceres — EOT restores 2 to your leader (4 if super-evolved)", () => {
    setupTurn(R6);
    const ceres = createCard("10153110", "board", "first");
    applyKeywordsFromList(ceres);
    ceres.peak_defense = ceres.defense;
    state.players.first.board = [ceres];
    state.players.first.hp = 15;
    whenEndTurn();
    expect(getHP(state, "first")).toBe(17);

    resetUidCounter();
    setupTurn(R6);
    const superCeres = createCard("10153110", "board", "first");
    applyKeywordsFromList(superCeres);
    superCeres.peak_defense = superCeres.defense;
    superCeres.evoType = "super";
    superCeres.hasEvolved = true;
    state.players.first.board = [superCeres];
    state.players.first.hp = 12;
    whenEndTurn();
    expect(getHP(state, "first")).toBe(16);
  });

  it("Orthrus — Fanfare +2 shadows; Evolve Necromancy (4) deals 2 twice to enemies", () => {
    setupTurn(R6, { hand: ["10153120"], pp: 3, shadows: 4 });
    whenPlayCard("first", 0);
    expect(getShadows(state, "first")).toBe(6);
    const orth = findOnBoard("first", "Orthrus, Hellhound Blader")!;
    enemyFollower(5);
    whenEvolve(orth, "first");
    expect(getShadows(state, "first")).toBe(2);
    expect(state.players.second.board[0]!.defense).toBe(1);
  });

  it("Mukan — Necromancy (8) evolves; Departed ally enter gains Bane", () => {
    setupTurn(R8, { hand: ["10153130"], pp: 5, shadows: 8 });
    whenPlayCard("first", 0);
    const mukan = findOnBoard("first", "Mukan, Shadowcrypt Ward")!;
    expect(mukan.hasEvolved).toBe(true);
    expect(getShadows(state, "first")).toBe(0);

    const departedCorpse = createCard("10151130", "graveyard", "first");
    state.players.first.graveyard.push(departedCorpse);
    recordDestroyed(state, "first", departedCorpse);
    runEffects(
      [{ op: "summon", source: "graveyard", max_cost: 3 } as any],
      "first",
      mukan,
    );
    const departed = thenBoard("first").find(
      (c) =>
        c.tribes?.includes("Departed") && c.name === "Little Miss Bonemancer",
    );
    expect(departed?.hasBane).toBe(true);
  });

  it("Balto — Fanfare crest EOT deals 1 to both leaders", () => {
    setupTurn(R6, { hand: ["10153140"], pp: 4 });
    state.players.first.hp = 20;
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(getHP(state, "first")).toBe(19);
    expect(getHP(state, "second")).toBe(19);
  });

  it("Rage of Serpents — 3 damage to selected enemy; 2 damage to your leader", () => {
    setupTurn(R6, { hand: ["10153310"], pp: 3 });
    const e = enemyFollower(4);
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(1);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Cerberus — Fanfare summons Mimi and Coco; Necromancy (6) buffs other allies +2/+0", () => {
    setupTurn(R10, { hand: ["10154110"], pp: 9, shadows: 6 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Mimi, Right Paw Hellhound")).toBeTruthy();
    expect(findOnBoard("first", "Coco, Left Paw Hellhound")).toBeTruthy();
    expect(ally.attack).toBe(3);
    expect(getShadows(state, "first")).toBe(0);
  });

  it("Medusa — Rush, 3 attacks per turn, strike destroys defender", () => {
    setupTurn(R8, { hand: ["10154120"], pp: 8 });
    const e = enemyFollower(3);
    whenPlayCard("first", 0);
    const medusa = findOnBoard("first", "Medusa, Venomfang Royalty")!;
    expect(medusa.hasRush).toBe(true);
    expect(medusa.attacks_per_turn).toBe(3);
    medusa.can_attack = true;
    attackFollower(0, 0, "first", "second");
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Aragavy — Fanfare 7 split among enemy followers; Evolve 3 to both leaders", () => {
    setupTurn(R6, { hand: ["10154130"], pp: 6 });
    const a = enemyFollower(4, "A");
    const b = enemyFollower(4, "B");
    state.players.first.hp = 20;
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    expect(a.defense + b.defense).toBeLessThan(8);

    const arag = findOnBoard("first", "Aragavy, Eternal Hunter")!;
    whenEvolve(arag, "first");
    expect(getHP(state, "first")).toBe(17);
    expect(getHP(state, "second")).toBe(17);
  });
});

function countSkeletons(): number {
  return thenBoard("first").filter((c) => c.name === "Skeleton").length;
}

describe("Batch 3 — Abysscraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Rayvn — Evolve destroys 2 enemies and deals 2 damage to your leader", () => {
    setupTurn(R6);
    const rayvn = createCard("10251110", "board", "first");
    rayvn.peak_defense = rayvn.defense;
    enemyFollower(4, "A");
    enemyFollower(4, "B");
    state.players.first.hp = 20;
    state.players.first.board = [rayvn];
    whenEvolve(rayvn, "first");
    const enemies = state.players.second.board;
    resolvePendingTarget(String(enemies[0]!.uid));
    resolvePendingTarget(String(enemies[1]!.uid));
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Cultivator of Malice — Last Words adds Ghost to hand", () => {
    setupTurn(R6);
    const cult = createCard("10251120", "board", "first");
    applyKeywordsFromList(cult);
    cult.defense = 0;
    state.players.first.board = [cult];
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Ghost")).toBe(true);
  });

  it("Ghastly Soiree — adds 3 named tokens to hand", () => {
    setupTurn(R6, { hand: ["10251310"], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(3);
  });

  it("Vuella — when another ally super-evolves, both gain +2/+0", () => {
    setupTurn(R10);
    const vuella = createCard("10252110", "board", "first");
    applyKeywordsFromList(vuella);
    vuella.peak_defense = vuella.defense;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = ally.defense;
    state.players.first.board = [vuella, ally];
    whenSuperEvolve(ally, "first");
    expect(ally.attack).toBe(7);
    expect(vuella.attack).toBe(4);
  });

  it("Undead Soldier — Fanfare summons 2 Rotting Zombies", () => {
    setupTurn(R8, { hand: ["10252120"], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Rotting Zombie").length,
    ).toBe(2);
  });

  it("Winged Servants — summons a Bat", () => {
    setupTurn(R6, { hand: ["10252310"], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Bat")).toBe(true);
  });

  it("Laura — Fanfare grants Bane to another allied follower", () => {
    setupTurn(R6, { hand: ["10253110"], pp: 4 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(ally.hasBane).toBe(true);
  });

  it("Exella — Fanfare +X/+0 for other allies on field; 2 damage to your leader", () => {
    setupTurn(R6, { hand: ["10253120"], pp: 5 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    const ex = findOnBoard("first", "Exella, Nocturnal General")!;
    expect(ex.attack).toBe(2);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Ginsetsu — Mode 1 summons 4 One-Tailed Fox", () => {
    setupTurn(R10, { hand: ["10254110"], pp: 10 });
    const opts = getCardById("10254110")!.fanfare![0] as any;
    runEffects(opts.options[0].effects, "first", null);
    expect(
      thenBoard("first").filter((c) => c.name === "One-Tailed Fox").length,
    ).toBe(4);
  });

  it("Charon — Fanfare Reanimate (2) and (1); Departed enter gains Ward", () => {
    setupTurn(R6, { hand: ["10254120"], pp: 6 });
    const corpses = [
      createCard("10151130", "graveyard", "first"),
      createCard("10152110", "graveyard", "first"),
      createCard("10151120", "graveyard", "first"),
    ];
    state.players.first.graveyard.push(...corpses);
    for (const corpse of corpses) recordDestroyed(state, "first", corpse);
    whenPlayCard("first", 0);
    const departed = thenBoard("first").filter((c) =>
      c.tribes?.includes("Departed"),
    );
    expect(departed.length).toBeGreaterThanOrEqual(1);
    expect(departed.every((c) => c.hasWard)).toBe(true);
  });
});

describe("Batch 3 — Abysscraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devotee of Entwining — Fanfare mode 1 deals 1 to all enemy followers", () => {
    setupTurn(R6, { hand: ["10351110"], pp: 4 });
    enemyFollower(3);
    enemyFollower(3, "B");
    whenPlayCard("first", 0);
    expect(state.players.second.board.every((c) => c.defense === 2)).toBe(true);
  });

  it("Ephemeral Demon Princess — Fanfare destroys 2 enemies and 4 damage to your leader", () => {
    setupTurn(R8, { hand: ["10351120"], pp: 8 });
    const a = enemyFollower(3, "A");
    const b = enemyFollower(3, "B");
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    resolvePendingTarget(String(a.uid));
    resolvePendingTarget(String(b.uid));
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getHP(state, "first")).toBe(16);
    expect(findOnBoard("first", "Ephemeral Demon Princess")?.hasStorm).toBe(
      true,
    );
  });

  it("March of the Brutes — damages all enemy followers twice", () => {
    setupTurn(R6, { hand: ["10351310"], pp: 5 });
    enemyFollower(5);
    whenPlayCard("first", 0);
    expect(state.players.second.board[0]!.defense).toBeLessThan(5);
  });

  it("Supplicant of Entwining — Evolve replicates Fanfare (mode damage)", () => {
    setupTurn(R6, { hand: ["10352110"], pp: 5 });
    const e = enemyFollower(4);
    whenPlayCard("first", 0);
    const sup = findOnBoard("first", "Supplicant of Entwining")!;
    whenEvolve(sup, "first");
    expect(e.defense).toBeLessThan(3);
  });

  it("Spirited Gravekeeper — Enhance (7) Reanimate (5) and (3)", () => {
    setupTurn(R9, { hand: ["10352120"], pp: 9 });
    const corpses = [
      createCard("10151130", "graveyard", "first"),
      createCard("10152110", "graveyard", "first"),
    ];
    state.players.first.graveyard.push(...corpses);
    for (const corpse of corpses) recordDestroyed(state, "first", corpse);
    whenPlayCard("first", 0);
    expect(thenBoard("first").length).toBeGreaterThanOrEqual(2);
  });

  it("Castle of Entwining — Mode 1 draws a card", () => {
    setupTurn(R6, {
      hand: ["10352210"],
      pp: 3,
      deck: [{ name: "Top", type: "Follower", attack: 1, defense: 1 }],
    });
    const drawFx = (getCardById("10352210")!.fanfare![0] as any).options[0]
      .effects;
    runEffects(drawFx, "first", null);
    expect(thenHand("first").some((c) => c.name === "Top")).toBe(true);
  });

  it("Congregant of Entwining — Fanfare mode 1 summons copy with Rush on both", () => {
    setupTurn(R6, { hand: ["10353110"], pp: 6 });
    whenPlayCard("first", 0);
    const mode1 = (getCardById("10353110")!.fanfare![0] as any).options[0]
      .effects;
    runEffects(
      mode1,
      "first",
      findOnBoard("first", "Congregant of Entwining")!,
    );
    const copies = thenBoard("first").filter(
      (c) => c.name === "Congregant of Entwining",
    );
    expect(copies.length).toBe(2);
    expect(copies.every((c) => c.hasRush)).toBe(true);
  });

  it("Rulenye & Valnareik — Fanfare adds a token spell to hand (mode pick)", () => {
    setupTurn(R7, { hand: ["10354120"], pp: 8 });
    whenPlayCard("first", 0);
    const handNames = thenHand("first").map((c) => c.name);
    expect(
      handNames.includes("Scream Diffusion") ||
        handNames.includes("Wings of Desire"),
    ).toBe(true);
  });
});

describe("Batch 3 — Abysscraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Almeida — Enhance (4) evolves and gains +1/+1; has Rush", () => {
    setupTurn(R6, { hand: ["10451110"], pp: 5 });
    whenPlayCard("first", 0);
    const al = findOnBoard("first", "Almeida, Headstrong Miner")!;
    expect(al.hasEvolved).toBe(true);
    expect(al.hasRush).toBe(true);
    expect(al.attack).toBeGreaterThanOrEqual(2);
  });

  it("Vaseraga — has Intimidate; Last Words summons copy and 2 damage to your leader", () => {
    setupTurn(R8, { hand: ["10451120"], pp: 7 });
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    const vas = findOnBoard("first", "Vaseraga, Unyielding Scythe")!;
    expect(vas.hasIntimidate).toBe(true);
    vas.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter((c) => c.name === "Vaseraga, Unyielding Scythe")
        .length,
    ).toBe(1);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Valiant Edge — 2 damage to your leader and gains crest", () => {
    setupTurn(R6, { hand: ["10451310"], pp: 3 });
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(18);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Valiant Edge")),
    ).toBe(true);
  });

  it("Satyr — Fanfare evolves when an evolved ally is on field", () => {
    setupTurn(R6, { hand: ["10452120"], pp: 4 });
    const evolved = createCard(
      { name: "EvoAlly", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    evolved.hasEvolved = true;
    state.players.first.board = [evolved];
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Satyr, Open-Hearted Rover")?.hasEvolved).toBe(
      true,
    );
  });

  it("Baal — Fanfare mode buffs Baal and another ally +1/+1", () => {
    setupTurn(R6, { hand: ["10452130"], pp: 4 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    const baal = createCard("10452130", "board", "first");
    state.players.first.board.push(baal);
    const mode1 = (getCardById("10452130")!.fanfare![0] as any).options[0]
      .effects;
    runEffects(mode1, "first", baal);
    expect(baal.attack).toBe(3);
    expect(ally.attack).toBe(3);
  });

  it("Nehan — Fanfare evolves all unevolved allies and 2 damage to your leader", () => {
    setupTurn(R8, { hand: ["10453110"], pp: 7 });
    const raw = createCard(
      { name: "Raw", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [raw];
    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    expect(raw.hasEvolved).toBe(true);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Corruption — gives all followers -2/-2", () => {
    setupTurn(R6, { hand: ["10453310"], pp: 6 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 4, defense: 4 },
      "board",
      "first",
    );
    const e = enemyFollower(4);
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(ally.attack).toBe(2);
    expect(ally.defense).toBe(2);
    expect(e.attack).toBe(0);
    expect(e.defense).toBe(2);
  });

  it("Fediel — Necromancy (6) reanimates and effect-evolves; EOT −2/−2 (no Evolve: lines)", () => {
    setupTurn(R10, {
      hand: [
        "10251120",
        "10251120",
        "10251120",
        "10251120",
        "10251120",
        "10152110",
        "10454110",
      ],
      pp: 10,
    });
    // Round trips must not deck-out (game-over locks End Turn). Spell pads keep
    // draws from injecting followers ahead of the scripted hand; strip pads from
    // hand so Cultivator LW Ghosts do not burn on overflow (extra shadows).
    state.players.first.deck = Array.from({ length: 20 }, (_, i) =>
      createCard(
        { name: `SpellPad${i}`, type: "Spell", cost: 0 },
        "deck",
        "first",
      ),
    );
    state.players.second.deck = Array.from({ length: 20 }, (_, i) =>
      createCard(
        {
          name: `EnemyPad${i}`,
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        "deck",
        "second",
      ),
    );
    const tradeIntoGraveyard = () => {
      state.players.first.hand = state.players.first.hand.filter(
        (c) => !String(c.name).startsWith("SpellPad"),
      );
      if (!state.players.second.board.length) enemyFollower(5, "Blocker");
      whenPlayCard("first", 0);
      whenEndTurn();
      whenEndTurn();
      attackFollower(0, 0, "first", "second");
      cleanupDead();
    };
    for (let i = 0; i < 5; i++) tradeIntoGraveyard();
    tradeIntoGraveyard();
    expect(getShadows(state, "first")).toBe(6);
    whenPlayCard("first", 0);
    expect(getShadows(state, "first")).toBe(0);
    const evolved = thenBoard("first").filter((c) => c.hasEvolved);
    expect(evolved.length).toBeGreaterThanOrEqual(2);
    expect(evolved.some((c) => c.name === "Mino, Shrewd Reaper")).toBe(true);
    expect(thenBoard("first").filter((c) => c.name === "Bat").length).toBe(0);
    const foe = enemyFollower(4, "EOT");
    whenEndTurn();
    expect(foe.attack).toBe(0);
    expect(foe.defense).toBe(2);
  });

  it("Belial — Fanfare 10 damage to all other followers", () => {
    setupTurn(R10, { hand: ["10454120"], pp: 8 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "first",
    );
    const e = enemyFollower(8);
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(ally.defense).toBe(0);
    expect(e.defense).toBe(0);
    expect(
      findOnBoard("first", "Belial, Archangel of Cunning")?.defense,
    ).toBeGreaterThan(0);
  });
});
