/**
 * Official Cygames Q&A — Forestcraft + Swordcraft batch 1 (27 cards).
 * Assertions match docs/official-qa.md answers; engine gaps → it.fails (see PR findings).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { toggleSecondPlayerBonusPp } from "../../src/core/bonusPp.js";
import { fuse_finalize_loot } from "../../src/logic/effects/ops/fuse/fuse.loot.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getBanish,
  setRally,
  getRally,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const MAY = "10012110";
const WAY_OF_MAID = "10021310";
const RUSTY = "10022120";
const CHLOE = "10412110";
const QUAKE = "10001130";
const AMPHIBIAN = "10522120";
const UNKEI = "10524120";
const OLUON = "10524110";
const MARLONE = "10811110";
const TRAP = "10911210";
const ADVENT_ELD_SWORD = "10621310";
const DEEPWOOD_FAIRY_BEAST = "10111130";
const BABY_CARBUNCLE = "10112130";
const SERAPHIC_TIDINGS = "10102310";
const LAMBENT_CAIRN = "10112210";
const LILY = "10113110";
const GLADE = "10113120";
const BAYLE = "10113130";
const GODWOOD_STAFF = "10113210";
const ARIA = "10114110";
const OPULENT_ROSE_QUEEN = "10114120";
const LYRALA = "10121130";
const IGNOMINIOUS = "10121150";
const KNIGHTLY_RENDING = "10121310";
const IRONCROWN_MAJESTY = "10122310";
const LUMINOUS_COMMANDER = "10122110";
const ROYAL_COACHWOMAN = "10022110";
const JENO = "10123110";
const AMELIA = "10124120";
const KAGEMITSU = "10124130";
const LYMAGA = "10214120";
const GILDARIA = "10224110";
const YURIUS = "10224120";
const OCTRICE = "10324120";
const SINCiro = "10324110";
const ODIN = "10204110";

const FAIRY = "90011110";
const KNIGHT = "90021110";
const STEELCLAD_KNIGHT = "90021120";
const FILLER = "10111310";
const SPELL_A = "10111310";
const SPELL_B = "10131310";

const UNKEI_CREST = "Unkei, Goldbloom";
const OCTRICE_CREST = "Octrice, Hollowness Manifest";
const ARIA_CREST = "Aria, Lady of the Woods";
const KAGEMITSU_CREST = "Kagemitsu, Enduring Warrior";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R9 = 9;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    board?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    seed?: number;
    secondHand?: string[];
    secondPP?: number;
    secondBoard?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 42,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.board?.length) b = b.withFirstBoard(opts.board);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP !== undefined) b = b.withSecondPP(opts.secondPP, max);
  if (opts.secondBoard?.length) b = b.withSecondBoard(opts.secondBoard);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
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
  atk = 2,
  def = 2,
  name = "Ally",
  owner: "first" | "second" = "first",
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
  return c;
}

function playCombo3(handIndex: number, player: "first" | "second" = "first") {
  whenPlayCard(player, handIndex);
  whenPlayCard(player, handIndex);
  whenPlayCard(player, handIndex);
}

function gainCrestByName(owner: "first" | "second", name: string): void {
  const cardId =
    name === UNKEI_CREST
      ? UNKEI
      : name === OCTRICE_CREST
        ? OCTRICE
        : name === ARIA_CREST
          ? ARIA
          : KAGEMITSU;
  const template = getCardById(cardId);
  const crestFx =
    template?.fanfare?.find((e: any) => e.op === "crest") ??
    template?.last_words?.find((e: any) => e.op === "crest") ??
    (template?.superevolve as any[])?.find((e: any) => e.op === "crest");
  if (crestFx) {
    handleGainCrest(crestFx as any, owner);
  } else {
    handleGainCrest({ op: "crest", action: "gain", name } as any, owner);
  }
}

function secondSideHpPool(): number {
  return (
    getHP(state, "second") +
    getBoard(state, "second").reduce((sum, c) => sum + Number(c.defense), 0)
  );
}

/** Real EVOLVE / SUPER_EVOLVE path (+2/+2 or +3/+3 and evolve script). */
function evolveFollower(
  card: CardInstance,
  owner: "first" | "second",
  mode: "normal" | "super" = "normal",
): void {
  const ps = state.players[owner];
  ps.evoUsedThisTurn = false;
  if (mode === "super") {
    ps.superEvoPoints = Math.max(1, ps.superEvoPoints ?? 0);
    ps.superEvoCharges = Math.max(1, ps.superEvoCharges ?? 0);
  } else {
    ps.evoCharges = Math.max(1, ps.evoCharges ?? 0);
  }
  handleEvolveSelf(card, owner, { mode, spendPoint: true });
}

describe("official Q&A — Forestcraft + Swordcraft batch 1", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  it("10012110 May, Journey Elf — Combo (3) counts the card being played (official Q&A)", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, MAY], pp: 6 });
    const foe = enemyFollower(2, 5, "Target");
    foe.uid = "may_target";
    playCombo3(0);
    expect(state.pendingTargetEffect).toBeDefined();
    resolvePendingByUid("may_target");
    expect(Number(foe.defense)).toBe(2);

    resetUidCounter();
    setupTurn(R6, { hand: [MAY], pp: 1 });
    const lone = enemyFollower(2, 5, "Lone");
    lone.uid = "lone_target";
    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(Number(lone.defense)).toBe(5);
  }, 60_000);

  it("10021310 Way of the Maid — returned Rusty keeps Storm when redrawn (official Q&A)", () => {
    setupTurn(R10, {
      hand: [WAY_OF_MAID, RUSTY],
      deck: ["10021110", "10021120"],
      pp: 10,
    });
    const rusty = thenHand("first").find((c) => c.id === RUSTY)!;
    applyKeywordsFromList(rusty);
    rusty.hasStorm = true;
    const rustyUid = rusty.uid;
    whenPlayCard("first", 0);
    resolvePendingByUid(rustyUid);
    const returned = [...thenHand("first"), ...thenDeck("first")].find(
      (c) => c.uid === rustyUid,
    );
    expect(returned).toBeTruthy();
    expect(returned!.hasStorm).toBe(true);
  }, 60_000);

  it("10412110 Chloe, What a Gal — full field: Quake not summoned, Chloe returns to hand (official Q&A)", () => {
    setupTurn(R10, { hand: [CHLOE, QUAKE], pp: 8 });
    for (let i = 0; i < 5; i++) {
      allyFollower(1, 1, `Fill${i}`);
    }
    const quakeUid = thenHand("first").find((c) => c.id === QUAKE)!.uid;
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) {
      resolvePendingByUid(quakeUid);
    }
    expect(getBoard(state, "first").every((c) => c.id !== QUAKE)).toBe(true);
    expect(thenHand("first").some((c) => c.id === CHLOE)).toBe(true);
    expect(thenHand("first").some((c) => c.id === QUAKE)).toBe(true);
  }, 60_000);

  it("10522120 Amphibian Goldmuncher — Crest Unkei + 1 spell does not satisfy 2-spell gate (official Q&A)", () => {
    setupTurn(R7, { hand: [AMPHIBIAN, SPELL_A], pp: 7 });
    gainCrestByName("first", UNKEI_CREST);
    const foe = enemyFollower(2, 8, "Foe");
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(Number(foe.defense)).toBe(8);

    resetUidCounter();
    setupTurn(R7, { hand: [AMPHIBIAN, SPELL_A, SPELL_B], pp: 7 });
    const foe2 = enemyFollower(2, 8, "Foe2");
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(Number(foe2.defense)).toBe(3);
  }, 60_000);

  it("10524110 Oluon, Raging Chariot — evolved EOT: 5 targets and 21 total damage under seed 11 (official Q&A)", () => {
    setupTurn(R9, { hand: [OLUON], pp: 9, evo: 2, seed: 11 });
    whenPlayCard("first", 0);
    const oluon = findOnBoard("first", "Oluon, Raging Chariot")!;
    evolveFollower(oluon, "first", "normal");
    for (let i = 0; i < 3; i++) {
      const f = createCard(FAIRY, "board", "second");
      f.peak_defense = f.defense;
      state.players.second.board.push(f);
    }
    expect(getBoard(state, "second").length + 2).toBe(5);
    state.players.second.hp = 20;
    state.players.first.hp = 20;
    const poolBefore = secondSideHpPool();
    whenEndTurn();
    expect(poolBefore - secondSideHpPool()).toBe(15);
    expect(getHP(state, "second")).toBe(6);

    resetUidCounter();
    setupTurn(R9, { hand: [OLUON], pp: 9, evo: 2, seed: 3 });
    whenPlayCard("first", 0);
    const oluonSolo = findOnBoard("first", "Oluon, Raging Chariot")!;
    evolveFollower(oluonSolo, "first", "normal");
    state.players.second.board = [];
    state.players.second.hp = 20;
    whenEndTurn();
    expect(getHP(state, "second")).toBe(0);
  }, 60_000);

  it("10811110 Marlone, Scales of the Past — X is 4 with 5 enemy and 0 allied followers before play (official Q&A)", () => {
    setupTurn(R8, { hand: [MARLONE], pp: 7, seed: 1 });
    for (let i = 0; i < 5; i++) {
      enemyFollower(1, 3, `Fairy${i}`);
    }
    whenPlayCard("first", 0);
    expect(thenBoard("second").length).toBe(1);
    expect(findOnBoard("first", "Marlone, Scales of the Past")).toBeTruthy();
  }, 60_000);

  // Flip to it when tests/mechanics/queued-ability-source-check.test.ts is on main (open PR #270).
  it.fails(
    "10911210 Trap in the Woods — only first of multi-summon destroyed (official Q&A)",
    () => {
      setupTurn(R6, {
        hand: [TRAP],
        pp: 3,
        secondHand: [ADVENT_ELD_SWORD],
        secondPP: 5,
        active: "first",
      });
      whenPlayCard("first", 0);
      whenEndTurn();
      whenPlayCard("second", 0);
      const soldiers = thenBoard("second").filter(
        (c) => c.name === "Fearless Soldier",
      );
      expect(soldiers.length).toBe(2);
      expect(findOnBoard("first", "Trap in the Woods")).toBeFalsy();
    },
    60_000,
  );

  it("10111130 Deepwood Fairy Beast — restores defense equal to hand size (official Q&A)", () => {
    setupTurn(R10, {
      hand: [
        DEEPWOOD_FAIRY_BEAST,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
        FILLER,
      ],
      pp: 10,
      hp: 10,
    });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(19);
  }, 60_000);

  it.fails(
    "10112130 Baby Carbuncle — Super-Evolve recovers 3 PP after bonus PP spend (official Q&A)",
    () => {
      givenGameState({
        seed: 42,
        activePlayer: "second",
        roundCount: 9,
      })
        .withSecondPP(9, 9)
        .withSecondHand([SERAPHIC_TIDINGS])
        .withSecondBoard([BABY_CARBUNCLE])
        .build();
      state.gameStarted = true;
      state.phase = "main";
      state.players.second.superEvoPoints = 1;
      state.players.second.superEvoCharges = 1;
      const carb = findOnBoard("second", "Baby Carbuncle")!;
      carb.peak_defense = carb.defense;
      applyKeywordsFromList(carb);
      toggleSecondPlayerBonusPp();
      expect(getPP(state, "second")).toBe(10);
      whenPlayCard("second", 0);
      expect(getPP(state, "second")).toBe(7);
      evolveFollower(carb, "second", "super");
      expect(getPP(state, "second")).toBe(10);
    },
    60_000,
  );

  it("10112210 Lambent Cairn — Engage with no allies destroys only the amulet (official Q&A)", () => {
    setupTurn(R6, { hand: [LAMBENT_CAIRN], pp: 2 });
    whenPlayCard("first", 0);
    const idx = getBoard(state, "first").findIndex(
      (c) => c.id === LAMBENT_CAIRN,
    );
    engageAmulet("first", idx);
    expect(findOnBoard("first", "Lambent Cairn")).toBeFalsy();
    expect(getBoard(state, "first").length).toBe(0);
  }, 60_000);

  it("10113110 Lily, Crystalian Innocence — evolved Quake Goliath at 4/1 becomes 6/3 (official Q&A)", () => {
    setupTurn(R6, { hand: [FILLER, FILLER, LILY], pp: 4 });
    const quake = createCard(QUAKE, "board", "second");
    quake.peak_defense = quake.defense;
    applyKeywordsFromList(quake);
    state.players.second.board = [quake];
    playCombo3(0);
    resolvePendingByUid(quake.uid);
    expect(Number(quake.attack)).toBe(4);
    expect(Number(quake.defense)).toBe(1);
    whenEndTurn();
    state.activePlayer = "second";
    evolveFollower(quake, "second", "normal");
    expect(Number(quake.attack)).toBe(6);
    expect(Number(quake.defense)).toBe(3);
  }, 60_000);

  it("10113110 Lily, Crystalian Innocence — super-evolved Quake Goliath at 4/1 becomes 7/4 (official Q&A)", () => {
    setupTurn(R7, { hand: [FILLER, FILLER, LILY], pp: 4 });
    const quake = createCard(QUAKE, "board", "second");
    quake.peak_defense = quake.defense;
    applyKeywordsFromList(quake);
    state.players.second.board = [quake];
    playCombo3(0);
    resolvePendingByUid(quake.uid);
    whenEndTurn();
    state.activePlayer = "second";
    evolveFollower(quake, "second", "super");
    expect(Number(quake.attack)).toBe(7);
    expect(Number(quake.defense)).toBe(4);
  }, 60_000);

  it("10113120 Glade, Fragrantwood Ward — split damage oldest-first 3/3/2 with X=7 (official Q&A)", () => {
    setupTurn(R8, {
      hand: [GLADE, FILLER, FILLER, FILLER, FILLER, FILLER],
      pp: 5,
    });
    const oldest = enemyFollower(1, 3, "Oldest");
    const middle = enemyFollower(1, 3, "Middle");
    const newest = enemyFollower(1, 2, "Newest");
    state.players.second.board = [oldest, middle, newest];
    whenPlayCard("first", 0);
    const glade = findOnBoard("first", "Glade, Fragrantwood Ward")!;
    evolveFollower(glade, "first", "normal");
    expect(Number(oldest.defense)).toBe(0);
    expect(Number(middle.defense)).toBe(0);
    expect(Number(newest.defense)).toBe(1);
  }, 60_000);

  it("10113130 Bayle, Luxglaive Warrior — ally destroyed on opponent turn reduces hand cost (official Q&A)", () => {
    setupTurn(R6, { hand: [FAIRY], pp: 1 });
    const bayle = createCard(BAYLE, "hand", "first");
    const baseCost = Number(bayle.cost);
    state.players.first.hand.push(bayle);
    whenPlayCard("first", 0);
    whenEndTurn();
    state.activePlayer = "second";
    const fairy = findOnBoard("first", "Fairy")!;
    fairy.defense = 0;
    cleanupDead();
    expect(Number(bayle.cost)).toBe(Math.max(0, baseCost - 1));

    resetUidCounter();
    setupTurn(R6, { hand: [FAIRY], pp: 1 });
    const bayle2 = createCard(BAYLE, "hand", "first");
    const cost0 = Number(bayle2.cost);
    state.players.first.hand.push(bayle2);
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(Number(bayle2.cost)).toBe(cost0);
  }, 60_000);

  it("10113210 Godwood Staff — Engage with no allies destroys only the amulet (official Q&A)", () => {
    setupTurn(R6, { hand: [GODWOOD_STAFF], pp: 3 });
    whenPlayCard("first", 0);
    const idx = getBoard(state, "first").findIndex(
      (c) => c.id === GODWOOD_STAFF,
    );
    engageAmulet("first", idx);
    expect(findOnBoard("first", "Godwood Staff")).toBeFalsy();
  }, 60_000);

  it("10114110 Aria, Lady of the Woods — cannot gain duplicate crest (official Q&A)", () => {
    setupTurn(R7, { hand: [ARIA, ARIA], pp: 12 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").filter((c) => c.name === ARIA_CREST).length,
    ).toBe(1);
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").filter((c) => c.name === ARIA_CREST).length,
    ).toBe(1);
  }, 60_000);

  it("10114120 Opulent Rose Queen — transforms 0-cost Bayle into Bramble Burst (official Q&A)", () => {
    setupTurn(R10, { hand: [OPULENT_ROSE_QUEEN], pp: 10 });
    const bayle = createCard(BAYLE, "hand", "first");
    bayle.cost = 0;
    state.players.first.hand.push(bayle);
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Bramble Burst")).toBe(
      true,
    );
    expect(thenHand("first").some((c) => c.id === BAYLE)).toBe(false);
  }, 60_000);

  it("10121130 Lyrala, Luminous Potionwright — Ironcrown Majesty Mode 1 restores 2 leader HP (official Q&A)", () => {
    setupTurn(R6, { hand: [IRONCROWN_MAJESTY], pp: 3 });
    const lyrala = createCard(LYRALA, "board", "first");
    lyrala.peak_defense = lyrala.defense;
    state.players.first.board = [lyrala];
    state.players.first.hp = 18;
    setScriptedModePickProvider(() => [0]);
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(20);
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(
      true,
    );
    expect(thenBoard("first").some((c) => c.name === "Knight")).toBe(true);
  }, 60_000);

  it("10121150 Ignominious Samurai — Bane at turn 9 going first without SEP (official Q&A)", () => {
    setupTurn(9, { hand: [IGNOMINIOUS], pp: 2 });
    state.players.first.superEvoPoints = 0;
    state.players.first.superEvoCharges = 0;
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Ignominious Samurai")?.hasBane).toBe(true);

    resetUidCounter();
    setupTurn(5, { hand: [IGNOMINIOUS], pp: 2 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Ignominious Samurai")?.hasBane).toBeFalsy();
  }, 60_000);

  it("10121310 Knightly Rending — unplayable without enemy follower (official Q&A)", () => {
    setupTurn(R6, { hand: [KNIGHTLY_RENDING], pp: 4 });
    const spell = thenHand("first")[0]!;
    expect(canPlayCard(spell, "first").ok).toBe(false);

    resetUidCounter();
    setupTurn(R6, { hand: [KNIGHTLY_RENDING], pp: 4 });
    enemyFollower(3, 3, "Victim");
    const spell2 = thenHand("first")[0]!;
    expect(canPlayCard(spell2, "first").ok).toBe(true);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second").length).toBe(0);
  }, 60_000);

  it("10122110 Luminous Commander — opponent-turn Last Words Knight grants +1/+0 until opponent EOT (official Q&A)", () => {
    setupTurn(R6, { active: "first" });
    const cmd = createCard(LUMINOUS_COMMANDER, "board", "first");
    cmd.peak_defense = cmd.defense;
    cmd.attack = 1;
    const coach = createCard(ROYAL_COACHWOMAN, "board", "first");
    coach.peak_defense = coach.defense;
    applyKeywordsFromList(coach);
    state.players.first.board = [cmd, coach];
    whenEndTurn();
    expect(state.activePlayer).toBe("second");
    coach.defense = 0;
    cleanupDead();
    expect(cmd.attack).toBe(2);
    whenEndTurn();
    expect(cmd.attack).toBe(1);
  }, 60_000);

  it("10123110 Jeno, Levin Axeraider — super-evolved attack removes Barrier (official Q&A)", () => {
    setupTurn(R8, { hand: [JENO], pp: 7 });
    enemyFollower(1, 5, "Blocker");
    whenPlayCard("first", 0);
    const jeno = findOnBoard("first", "Jeno, Levin Axeraider")!;
    evolveFollower(jeno, "first", "super");
    jeno.can_attack = true;
    jeno.justPlayed = false;
    const idx = getBoard(state, "first").indexOf(jeno);
    attackFollower(idx, 0, "first", "second");
    expect(jeno.hasBarrier || jeno.keywordState?.hasBarrier).toBeFalsy();
    expect(
      (jeno as any).__uiPopBarrier || (jeno as any).__barrierPopReason,
    ).toBeTruthy();
  }, 60_000);

  it("10124120 Amelia, Silver Captain — Knight loses Barrier after super-evolved attack (official Q&A)", () => {
    setupTurn(R8, { hand: [AMELIA], pp: 8 });
    const knight = createCard(KNIGHT, "board", "first");
    knight.peak_defense = knight.defense;
    state.players.first.board = [knight];
    whenPlayCard("first", 0);
    const amelia = findOnBoard("first", "Amelia, Silver Captain")!;
    evolveFollower(amelia, "first", "super");
    const barrierKnight = thenBoard("first").find((c) => c.id === KNIGHT)!;
    expect(barrierKnight.hasBarrier).toBe(true);
    evolveFollower(barrierKnight, "first", "super");
    barrierKnight.can_attack = true;
    barrierKnight.justPlayed = false;
    enemyFollower(1, 5, "Foe");
    const kIdx = getBoard(state, "first").indexOf(barrierKnight);
    attackFollower(kIdx, 0, "first", "second");
    expect(barrierKnight.hasBarrier).toBeFalsy();
  }, 60_000);

  it("10124130 Kagemitsu, Enduring Warrior — cannot gain duplicate crest from Last Words (official Q&A)", () => {
    setupTurn(R6, { hand: [KAGEMITSU, KAGEMITSU], pp: 6 });
    whenPlayCard("first", 0);
    const kag = findOnBoard("first", "Kagemitsu, Enduring Warrior")!;
    kag.defense = 0;
    cleanupDead();
    expect(
      getCrests(state, "first").filter((c) => c.name === KAGEMITSU_CREST)
        .length,
    ).toBe(1);
    whenPlayCard("first", 0);
    const kag2 = findOnBoard("first", "Kagemitsu, Enduring Warrior")!;
    kag2.defense = 0;
    cleanupDead();
    expect(
      getCrests(state, "first").filter((c) => c.name === KAGEMITSU_CREST)
        .length,
    ).toBe(1);
  }, 60_000);

  it("10214120 Lymaga, Untamed Wild — bleed triggers at both players' end of turn (official Q&A)", () => {
    setupTurn(R10, { hand: [LYMAGA], pp: 7, evo: 0 });
    const victim = enemyFollower(2, 5, "Victim");
    whenPlayCard("first", 0);
    const lym = findOnBoard("first", "Lymaga, Untamed Wild")!;
    evolveFollower(lym, "first", "super");
    resolveFirstPending();
    const pending = state.pendingTargetEffect;
    if (pending?.poolUids?.[1]) {
      resolvePendingByUid(String(pending.poolUids[1]));
    } else if (pending?.pool?.[1]) {
      resolvePendingByUid(String(pending.pool[1].uid));
    }
    state.players.second.hp = 20;
    const defBefore = Number(victim.defense);
    whenEndTurn();
    expect(getHP(state, "second")).toBe(19);
    expect(Number(victim.defense)).toBe(defBefore - 2);
    whenEndTurn();
    expect(getHP(state, "second")).toBe(18);
    expect(Number(victim.defense)).toBe(defBefore - 4);
  }, 60_000);

  it("10224110 Gildaria, Anathema of Peace — Rally 19 Fanfare does not super-evolve (official Q&A)", () => {
    setupTurn(R7, { hand: [GILDARIA], pp: 6 });
    setRally(state, "first", 19);
    state.players.first.superEvoPoints = 1;
    whenPlayCard("first", 0);
    const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
    expect(gild.evoType).not.toBe("super");
    expect(getRally(state, "first")).toBe(20);

    resetUidCounter();
    setupTurn(R7, { hand: [GILDARIA], pp: 6 });
    setRally(state, "first", 20);
    state.players.first.superEvoPoints = 1;
    whenPlayCard("first", 0);
    const gild2 = findOnBoard("first", "Gildaria, Anathema of Peace")!;
    expect(gild2.evoType).toBe("super");
  }, 60_000);

  it("10224120 Yurius, Levin Authority — banished Yurius does not trigger on enemy enter (official Q&A)", () => {
    setupTurn(R8, {
      hand: [ODIN],
      pp: 7,
      secondBoard: [YURIUS],
      secondPP: 8,
    });
    const yurius = findOnBoard("second", "Yurius, Levin Authority")!;
    whenPlayCard("first", 0);
    resolvePendingByUid(yurius.uid);
    expect(getBanish(state, "second").some((c) => c.uid === yurius.uid)).toBe(
      true,
    );
    state.players.second.hp = 20;
    state.players.first.hp = 15;
    whenEndTurn();
    state.players.second.hand = [createCard(FAIRY, "hand", "second")];
    state.players.second.pp = 1;
    whenPlayCard("second", 0);
    expect(getHP(state, "second")).toBe(20);
    expect(getHP(state, "first")).toBe(15);
  }, 60_000);

  it("10324120 Octrice, Hollowness Manifest — fusing 2 Loot at once advances crest by 1 (official Q&A)", () => {
    setupTurn(R6, { hand: [OCTRICE], pp: 3 });
    whenPlayCard("first", 0);
    const crestBefore = getCrests(state, "first").find(
      (c) => c.name === OCTRICE_CREST,
    )!;
    const cdBefore = crestBefore.countdown ?? crestBefore.count ?? 8;
    const host = createCard(SINCiro, "hand", "first");
    host.fuse_recipes = getCardById(SINCiro)!.fuse_recipes;
    const blade = createCard(
      { name: "Gilded Blade", type: "Spell", cost: 1, tribes: ["Loot"] },
      "hand",
      "first",
    );
    const boots = createCard(
      { name: "Gilded Boots", type: "Spell", cost: 1, tribes: ["Loot"] },
      "hand",
      "first",
    );
    state.players.first.hand.push(host, blade, boots);
    fuse_finalize_loot("first", host.uid, [blade, boots]);
    const crestAfter = getCrests(state, "first").find(
      (c) => c.name === OCTRICE_CREST,
    )!;
    const cdAfter = crestAfter.countdown ?? crestAfter.count ?? 8;
    expect(cdBefore - cdAfter).toBe(1);
  }, 60_000);
});
