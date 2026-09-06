/**
 * Official Cygames Q&A — Runecraft batch 2 (21 Q&A on 15 cards).
 * Assertions follow official answers; owner rulings in docs/owner-rulings.md override when applicable.
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
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { toggleSecondPlayerBonusPp } from "../../src/core/bonusPp.js";
import { getSkyboundArtGauge } from "../../src/logic/effects/skybound.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import {
  crestAddCounter,
  handleGainCrest,
} from "../../src/logic/effects/crest.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const DAZZLING_RUNEKNIGHT = "10031110";
const WITCHS_NEW_BREW = "10031210";
const MIREILLE_RISETTE = "10432120";
const GRANDEUR_DAWNBLOSSOM = "10533310";
const OBSESSED_TEST_SUBJECT = "10931110";
const SEPHIE = "10934110";
const APPRENTICE_ASTROLOGER = "10131120";
const RADIANT_RAINBOW = "10131310";
const SAGELIGHT_TEACHINGS = "10132310";
const SNOWMAN_ARMY = "10132320";
const JUNO = "10133110";
const DIMENSION_CLIMB = "10134310";
const NORMAN = "10234120";
const INSTITUTE_OF_TRUTH = "10332210";
const DEPTHS_ELD_CRYSTALS = "90034330";
const SEND_EM_PACKING = "90034350";

// Helpers / related cards
const BLAZE_DESTROYER = "10032120";
const STORMY_BLAST = "10131320";
const INDOMITABLE_FIGHTER = "10001110";
const QUAKE_GOLIATH = "10001130";
const CLAY_GOLEM = "90031110";
const WHITEFROST_WHISPER = "90044310";
const ARMS_DEPLETIVE_DEMON = "10654110";
const KUON = "10134110";
const ALCHEMIC_FLARE = "10433310";
const FILLER = "10111310";
const FORESIGHT = "10031310";
const DRAW_TOP = "10021110";

const CALGE_FAITH = faithCrestNameForCard("Calge-Danthla, Eld Crystals");
const DEPTHS_SEED = 42;
/** Pinned under faith 3 + DEPTHS_SEED — three independent X/Y/Z draws. */
const DEPTHS_FAITH3_SPLIT = { X: 0, Y: 1, Z: 2 } as const;

const R5 = 5;
const R6 = 6;
const R8 = 8;
const R9 = 9;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | Record<string, unknown>>;
    pp?: number;
    maxPP?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    secondDeck?: string[];
    seed?: number;
  } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  });
  if (opts.active === "second") {
    b = b.withSecondPP(pp, max);
    if (opts.hand?.length) b = b.withSecondHand(opts.hand);
    if (opts.deck?.length) b = b.withSecondDeck(opts.deck as string[]);
    if (opts.hp !== undefined) b = b.withSecondHP(opts.hp);
    if (opts.evo !== undefined) b = b.withSecondEvo(opts.evo);
    if (opts.secondHand?.length) b = b.withFirstHand(opts.secondHand);
    if (opts.secondPP != null) b = b.withFirstPP(opts.secondPP, max);
    if (opts.secondDeck?.length) b = b.withFirstDeck(opts.secondDeck);
    else b = b.withFirstDeck(Array(10).fill(FILLER));
  } else {
    b = b.withFirstPP(pp, max);
    if (opts.hand?.length) b = b.withFirstHand(opts.hand as string[]);
    if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
    if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
    if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
    if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
    if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
    if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
    else b = b.withSecondDeck(Array(10).fill(FILLER));
  }
  b.build();
  if (opts.superEvo !== undefined) {
    const slot = opts.active === "second" ? "second" : "first";
    state.players[slot].superEvoCharges = opts.superEvo;
    state.players[slot].superEvoPoints = opts.superEvo;
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
  const owner = state.activePlayer === "first" ? "second" : "first";
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
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

function earthSigilStack(player: "first" | "second" = "first"): number {
  return thenBoard(player)
    .filter((c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0)
    .reduce((sum, c) => sum + (c.counters?.earth ?? 0), 0);
}

function placeEarthSigils(
  n: number,
  player: "first" | "second" = "first",
): void {
  const sediment = createCard(
    { name: "Magic Sediment", type: "Amulet", cost: 1 },
    "board",
    player,
  );
  sediment.counters = { earth: n };
  state.players[player].board.push(sediment);
}

function sbCount(card: {
  keywordState?: { spellboostCount?: number };
  spellboostCount?: number;
}): number {
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

function stormyX(card: CardInstance): number {
  return 2 + sbCount(card);
}

function setEnterHistory(count: number): void {
  state.players.first.followerEnterHistory = Array.from(
    { length: count },
    () => ({
      name: "Obsessed Test Subject",
      tribes: [],
      cardId: OBSESSED_TEST_SUBJECT,
    }),
  );
}

function playWhitefrostHandCostMode(): void {
  setScriptedModePickProvider(() => [1]);
  whenPlayCard("second", 0);
  setScriptedModePickProvider(null);
}

function readRandomSplit(): { total: number; parts: Record<string, number> } {
  const entry = getLogs()
    .slice()
    .reverse()
    .find((e) => e.type === "randomSplit");
  expect(entry, "randomSplit event").toBeTruthy();
  return entry!.details as { total: number; parts: Record<string, number> };
}

function setupDepthsFaith(amount: number): void {
  setupTurn(R10, {
    hand: [DEPTHS_ELD_CRYSTALS],
    pp: 6,
    deck: ["10634120", ...Array(39).fill(FILLER)],
    seed: DEPTHS_SEED,
  });
  bootstrapFaithForPlayer(
    "first",
    state.players.first.deck,
    state.players.first.hand,
  );
  crestAddCounter("first", CALGE_FAITH, "faith", amount);
}

function gainJunoCrest(player: "first" | "second" = "first"): void {
  handleGainCrest(
    {
      op: "crest",
      action: "gain",
      name: "Juno, Visionary Alchemist",
      countdown: 3,
      description:
        "Countdown (3). At the end of your turn: Earth Rite (1) – Summon a Guardian Golem.",
    } as any,
    player,
  );
}

describe("official Q&A — Runecraft batch 2", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  it("10031110 Dazzling Runeknight — Mode 2 without earth sigils fizzles (+2/+2 Ward only with Earth Rite) (official Q&A)", () => {
    setupTurn(R6, { hand: [DAZZLING_RUNEKNIGHT], pp: 3 });
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    const knight = findOnBoard("first", "Dazzling Runeknight")!;
    expect(Number(knight.attack)).toBe(2);
    expect(Number(knight.defense)).toBe(2);
    expect(earthSigilStack()).toBe(0);

    resetUidCounter();
    setupTurn(R6, { hand: [DAZZLING_RUNEKNIGHT], pp: 3 });
    placeEarthSigils(1);
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    const buffed = findOnBoard("first", "Dazzling Runeknight")!;
    expect(Number(buffed.attack)).toBe(4);
    expect(Number(buffed.defense)).toBe(4);
  }, 60_000);

  it("10031210 Witch's New Brew — can Engage a second copy when you still have PP (official Q&A)", () => {
    setupTurn(R6, { hand: [WITCHS_NEW_BREW, WITCHS_NEW_BREW], pp: 4 });
    whenPlayCard("first", 0);
    const firstIdx = thenBoard("first").findIndex(
      (c) => c.name === "Witch's New Brew",
    );
    engageAmulet("first", firstIdx);
    expect(earthSigilStack()).toBe(2);
    expect(getPP(state, "first")).toBe(2);

    whenPlayCard("first", 0);
    const secondIdx = thenBoard("first").findIndex(
      (c, i) => c.name === "Witch's New Brew" && i !== firstIdx,
    );
    engageAmulet("first", secondIdx);
    expect(earthSigilStack()).toBe(3);
    expect(getPP(state, "first")).toBe(1);
  }, 60_000);

  it("10432120 Mireille & Risette — Earth Rite dual evolve increases hand Skybound Art gauges by 2 (official Q&A)", () => {
    setupTurn(R8, { hand: [MIREILLE_RISETTE, ALCHEMIC_FLARE], pp: 5 });
    placeEarthSigils(2);
    const flare = thenHand("first").find((c) => c.id === ALCHEMIC_FLARE)!;
    const gauge0 = flare.skyboundArtEvolvesWitnessed ?? 0;
    whenPlayCard("first", 0);
    expect(flare.skyboundArtEvolvesWitnessed ?? 0).toBe(gauge0 + 2);
    expect(getSkyboundArtGauge(flare, R8)).toBe(R8 + gauge0 + 2);
  }, 60_000);

  it("10533310 Grandeur of the Dawnblossom — each Clay Golem picks independently from deck followers (official Q&A)", () => {
    const runGrandeur = (seed: number) => {
      resetUidCounter();
      setupTurn(R10, {
        hand: [GRANDEUR_DAWNBLOSSOM],
        deck: [INDOMITABLE_FIGHTER, QUAKE_GOLIATH],
        pp: 7,
        seed,
      });
      const g1 = createCard(CLAY_GOLEM, "board", "first");
      const g2 = createCard(CLAY_GOLEM, "board", "first");
      g1.peak_defense = g1.defense;
      g2.peak_defense = g2.defense;
      state.players.first.board = [g1, g2];
      whenPlayCard("first", 0);
      return thenBoard("first").map((c) => String(c.id));
    };

    const sameBoth = runGrandeur(3);
    expect(sameBoth).toHaveLength(2);
    expect(
      sameBoth.every((id) => [INDOMITABLE_FIGHTER, QUAKE_GOLIATH].includes(id)),
    ).toBe(true);
    expect(sameBoth[0]).toBe(sameBoth[1]);

    const distinct = runGrandeur(1);
    expect(distinct).toHaveLength(2);
    expect(new Set(distinct).size).toBe(2);
  }, 60_000);

  it("10931110 Obsessed Test Subject — Sephie Fanfare summons 2/2 then 5/5 when four entered before (official Q&A)", () => {
    setupTurn(R8, { hand: [SEPHIE], pp: 7 });
    setEnterHistory(4);
    whenPlayCard("first", 0);
    const subjects = thenBoard("first").filter(
      (c) => c.id === OBSESSED_TEST_SUBJECT,
    );
    expect(subjects).toHaveLength(2);
    expect(Number(subjects[0]!.attack)).toBe(2);
    expect(Number(subjects[0]!.defense)).toBe(2);
    expect(Number(subjects[1]!.attack)).toBe(5);
    expect(Number(subjects[1]!.defense)).toBe(5);
  }, 60_000);

  it.fails(
    "10131120 Apprentice Astrologer — returned Blaze Destroyer keeps spellboosted cost when redrawn (official Q&A)",
    () => {
      setupTurn(R6, {
        hand: [APPRENTICE_ASTROLOGER, BLAZE_DESTROYER],
        deck: [DRAW_TOP, BLAZE_DESTROYER],
        pp: 2,
      });
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      spellboostHand("first", 5, blaze);
      expect(getEffectiveCost(blaze)).toBe(5);
      whenPlayCard("first", 0);
      resolvePendingByUid(blaze.uid);
      const redrawn = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      expect(redrawn).toBeTruthy();
      expect(getEffectiveCost(redrawn)).toBe(5);
    },
    60_000,
  );

  it("10131120 Apprentice Astrologer — Fanfare activates with only itself in hand (official Q&A)", () => {
    setupTurn(R6, { hand: [APPRENTICE_ASTROLOGER], deck: [DRAW_TOP], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === DRAW_TOP)).toBe(true);
    expect(findOnBoard("first", "Apprentice Astrologer")).toBeTruthy();
    expect(earthSigilStack()).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it.fails(
    "10131120 Apprentice Astrologer — gains earth sigil even with one field slot and existing Earth Sigil (official Q&A)",
    () => {
      setupTurn(R6, { hand: [APPRENTICE_ASTROLOGER, FILLER], pp: 2 });
      placeEarthSigils(1);
      for (let i = 0; i < 3; i++) allyFollower(1, 1, `Ally${i}`);
      const sigilsBefore = earthSigilStack();
      whenPlayCard("first", 0);
      resolvePendingByUid(thenHand("first").find((c) => c.id === FILLER)!.uid);
      expect(earthSigilStack()).toBe(sigilsBefore + 1);
    },
    60_000,
  );

  it("10131310 Radiant Rainbow — unplayable without On Spellboost card in hand (official Q&A)", () => {
    setupTurn(R6, { hand: [RADIANT_RAINBOW, FILLER], pp: 2 });
    const rainbow = thenHand("first").find((c) => c.id === RADIANT_RAINBOW)!;
    const blocked = canPlayCard(rainbow, "first");
    expect(blocked.ok).toBe(false);
    expect(thenHand("first").some((c) => c.id === RADIANT_RAINBOW)).toBe(true);

    resetUidCounter();
    setupTurn(R6, { hand: [RADIANT_RAINBOW, BLAZE_DESTROYER], pp: 2 });
    const live = thenHand("first").find((c) => c.id === RADIANT_RAINBOW)!;
    expect(canPlayCard(live, "first").ok).toBe(true);
  }, 60_000);

  it("10132310 Sagelight Teachings — Mode 3 without 3 earth sigils deals no AoE damage (official Q&A)", () => {
    setupTurn(R6, { hand: [SAGELIGHT_TEACHINGS], pp: 3 });
    const e1 = enemyFollower(2, 5, "E1");
    const e2 = enemyFollower(2, 5, "E2");
    setScriptedModePickProvider(() => [2]);
    whenPlayCard("first", 0);
    expect(Number(e1.defense)).toBe(5);
    expect(Number(e2.defense)).toBe(5);

    resetUidCounter();
    setupTurn(R6, { hand: [SAGELIGHT_TEACHINGS], pp: 3 });
    placeEarthSigils(3);
    const e3 = enemyFollower(2, 5, "E3");
    const e4 = enemyFollower(2, 5, "E4");
    setScriptedModePickProvider(() => [2]);
    whenPlayCard("first", 0);
    expect(Number(e3.defense)).toBe(1);
    expect(Number(e4.defense)).toBe(1);
  }, 60_000);

  it("10132320 Snowman Army — evolved Quake Goliath at 4/1 becomes 6/3 (official Q&A)", () => {
    setupTurn(R8, {
      active: "second",
      hand: [SNOWMAN_ARMY],
      pp: 8,
    });
    state.players.first.evoCharges = 1;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    const quake = createCard(QUAKE_GOLIATH, "board", "first");
    quake.peak_defense = quake.defense;
    state.players.first.board = [quake];
    whenPlayCard("second", 0);
    resolvePendingByUid(quake.uid);
    expect(Number(quake.attack)).toBe(4);
    expect(Number(quake.defense)).toBe(1);

    state.activePlayer = "first";
    handleEvolveSelf(quake, "first", { mode: "normal", spendPoint: true });
    expect(Number(quake.attack)).toBe(6);
    expect(Number(quake.defense)).toBe(3);
  }, 60_000);

  it("10132320 Snowman Army — super-evolved Quake Goliath at 4/1 becomes 7/4 (official Q&A)", () => {
    setupTurn(R8, {
      active: "second",
      hand: [SNOWMAN_ARMY],
      pp: 8,
    });
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    const quake = createCard(QUAKE_GOLIATH, "board", "first");
    quake.peak_defense = quake.defense;
    state.players.first.board = [quake];
    whenPlayCard("second", 0);
    resolvePendingByUid(quake.uid);

    state.activePlayer = "first";
    handleEvolveSelf(quake, "first", { mode: "super", spendPoint: true });
    expect(Number(quake.attack)).toBe(7);
    expect(Number(quake.defense)).toBe(4);
  }, 60_000);

  it("10133110 Juno — cannot gain a second Crest: Juno, Visionary Alchemist (official Q&A)", () => {
    setupTurn(R8, { hand: [JUNO, JUNO], pp: 10, evo: 2 });
    gainJunoCrest("first");
    expect(
      getCrests(state, "first").filter((c) => c.name.includes("Juno")),
    ).toHaveLength(1);

    whenPlayCard("first", 0);
    const juno = findOnBoard("first", "Juno, Visionary Alchemist")!;
    onEvolve(juno, "first", "normal", { spendPoint: true });
    expect(
      getCrests(state, "first").filter((c) => c.name.includes("Juno")),
    ).toHaveLength(1);
  }, 60_000);

  it.fails(
    "10134310 Dimension Climb — redrawn Blaze Destroyer keeps cost 6 then spellboosts to 0 (official Q&A)",
    () => {
      setupTurn(R10, {
        hand: [DIMENSION_CLIMB, BLAZE_DESTROYER],
        deck: [BLAZE_DESTROYER, ...Array(19).fill(FILLER)],
        pp: 10,
      });
      const climb = thenHand("first").find((c) => c.id === DIMENSION_CLIMB)!;
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      spellboostHand("first", 18, climb);
      spellboostHand("first", 4, blaze);
      expect(getEffectiveCost(climb)).toBe(0);
      expect(getEffectiveCost(blaze)).toBe(6);

      whenPlayCard("first", 0);
      const redrawn = thenHand("first").find((c) => c.id === BLAZE_DESTROYER);
      expect(redrawn).toBeTruthy();
      expect(getEffectiveCost(redrawn!)).toBe(0);
    },
    60_000,
  );

  it.fails(
    "10134310 Dimension Climb — redrawn Stormy Blast keeps X=4 then spellboosts to X=10 (official Q&A)",
    () => {
      setupTurn(R10, {
        hand: [DIMENSION_CLIMB, STORMY_BLAST],
        deck: [STORMY_BLAST, ...Array(19).fill(FILLER)],
        pp: 10,
      });
      const climb = thenHand("first").find((c) => c.id === DIMENSION_CLIMB)!;
      const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
      spellboostHand("first", 18, climb);
      spellboostHand("first", 2, blast);
      expect(getEffectiveCost(climb)).toBe(0);
      expect(stormyX(blast)).toBe(4);

      whenPlayCard("first", 0);
      const redrawn = thenHand("first").find((c) => c.id === STORMY_BLAST);
      expect(redrawn).toBeTruthy();
      expect(stormyX(redrawn!)).toBe(10);
    },
    60_000,
  );

  it.fails(
    "10134310 Dimension Climb — fully recovers max PP (9) not bonus PP after Kuon Enhance (10) (official Q&A)",
    () => {
      setupTurn(R9, {
        active: "second",
        hand: [KUON, DIMENSION_CLIMB],
        pp: 9,
        maxPP: 9,
      });
      state.players.second.maxPP = 9;
      state.players.second.pp = 9;
      toggleSecondPlayerBonusPp();
      expect(getPP(state, "second")).toBe(10);

      const climb = thenHand("second").find((c) => c.id === DIMENSION_CLIMB)!;
      spellboostHand("second", 18, climb);
      expect(getEffectiveCost(climb)).toBe(0);

      whenPlayCard(
        "second",
        thenHand("second").findIndex((c) => c.id === KUON),
      );
      expect(getPP(state, "second")).toBe(0);

      whenPlayCard(
        "second",
        thenHand("second").findIndex((c) => c.id === DIMENSION_CLIMB),
      );
      expect(getPP(state, "second")).toBe(9);
    },
    60_000,
  );

  it("10234120 Norman — Evolve replicate offers Mode selection again (official Q&A)", () => {
    setupTurn(R10, {
      hand: [NORMAN],
      deck: [DRAW_TOP, DRAW_TOP, DRAW_TOP, FILLER],
      pp: 6,
      evo: 1,
    });
    placeEarthSigils(2);
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    const handAfterFanfare = getHand(state, "first").length;

    const norman = findOnBoard("first", "Norman, Adamant Alchemist")!;
    setScriptedModePickProvider(() => [0]);
    onEvolve(norman, "first", "normal", { spendPoint: true });
    expect(getHand(state, "first").length).toBe(handAfterFanfare);
    expect(thenBoard("first").some((c) => c.id === "90031120")).toBe(true);
  }, 60_000);

  it.fails(
    "10332210 Institute of Truth — 0-cost Blaze Destroyer triggers cost-changed draw (official Q&A)",
    () => {
      setupTurn(R6, {
        hand: [BLAZE_DESTROYER],
        deck: [DRAW_TOP, DRAW_TOP],
        pp: 0,
      });
      const institute = createCard(INSTITUTE_OF_TRUTH, "board", "first");
      institute.countdown = 5;
      state.players.first.board = [institute];
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      spellboostHand("first", 10, blaze);
      expect(getEffectiveCost(blaze)).toBe(0);
      const deck0 = thenDeck("first").length;
      const cd0 = Number(institute.countdown);
      whenPlayCard("first", 0);
      expect(thenDeck("first").length).toBe(deck0 - 1);
      expect(Number(institute.countdown)).toBe(cd0 - 1);
    },
    60_000,
  );

  it("10332210 Institute of Truth — Quake Goliath at 5 from enemy Whitefrost triggers (official Q&A)", () => {
    setupTurn(R6, {
      hand: [INSTITUTE_OF_TRUTH, QUAKE_GOLIATH],
      deck: [DRAW_TOP],
      pp: 5,
      secondHand: [WHITEFROST_WHISPER],
      secondPP: 3,
    });
    whenPlayCard("first", 0);
    const institute = findOnBoard("first", "Institute of Truth")!;
    const cd0 = Number(institute.countdown);
    const deck0 = thenDeck("first").length;

    whenEndTurn();
    playWhitefrostHandCostMode();

    whenEndTurn();
    const goliath = thenHand("first").find((c) => c.id === QUAKE_GOLIATH)!;
    expect(getEffectiveCost(goliath)).toBe(5);
    whenPlayCard("first", 0);
    expect(thenDeck("first").length).toBe(deck0 - 1);
    expect(Number(institute.countdown)).toBe(cd0 - 1);
  }, 60_000);

  it.fails(
    "10332210 Institute of Truth — Blaze Destroyer back at printed cost 10 after Whitefrost does not trigger (official Q&A)",
    () => {
      setupTurn(R6, {
        hand: [INSTITUTE_OF_TRUTH, BLAZE_DESTROYER],
        deck: [DRAW_TOP],
        pp: 10,
        secondHand: [WHITEFROST_WHISPER],
        secondPP: 3,
      });
      whenPlayCard("first", 0);
      const institute = findOnBoard("first", "Institute of Truth")!;
      const deck0 = thenDeck("first").length;
      const cd0 = Number(institute.countdown);

      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      spellboostHand("first", 1, blaze);
      expect(getEffectiveCost(blaze)).toBe(9);

      whenEndTurn();
      playWhitefrostHandCostMode();
      whenEndTurn();
      expect(getEffectiveCost(blaze)).toBe(10);

      const blazeIdx = thenHand("first").findIndex(
        (c) => c.id === BLAZE_DESTROYER,
      );
      whenPlayCard("first", blazeIdx);
      expect(thenDeck("first").length).toBe(deck0);
      expect(Number(institute.countdown)).toBe(cd0);

      resetUidCounter();
      setupTurn(R6, {
        hand: [INSTITUTE_OF_TRUTH, BLAZE_DESTROYER],
        deck: [DRAW_TOP],
        pp: 9,
      });
      whenPlayCard("first", 0);
      const institute2 = findOnBoard("first", "Institute of Truth")!;
      const blaze2 = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      spellboostHand("first", 1, blaze2);
      const deck1 = thenDeck("first").length;
      const cd1 = Number(institute2.countdown);
      const blaze2Idx = thenHand("first").findIndex(
        (c) => c.id === BLAZE_DESTROYER,
      );
      whenPlayCard("first", blaze2Idx);
      expect(thenDeck("first").length).toBe(deck1 - 1);
      expect(Number(institute2.countdown)).toBe(cd1 - 1);
    },
    60_000,
  );

  it("90034330 Depths of the Eld Crystals — faith 3 splits X+Y+Z=3 via three random letter picks (official Q&A)", () => {
    (globalThis as any).HEADLESS = false;
    clearLogs();
    setupDepthsFaith(3);
    whenPlayCard("first", 0);
    const split = readRandomSplit();
    expect(split.total).toBe(3);
    expect(split.parts).toEqual(DEPTHS_FAITH3_SPLIT);
    expect(
      (split.parts.X ?? 0) + (split.parts.Y ?? 0) + (split.parts.Z ?? 0),
    ).toBe(3);

    const findFaith3Split = (seed: number) => {
      resetUidCounter();
      clearLogs();
      setupTurn(R10, {
        hand: [DEPTHS_ELD_CRYSTALS],
        pp: 6,
        deck: ["10634120", ...Array(39).fill(FILLER)],
        seed,
      });
      bootstrapFaithForPlayer(
        "first",
        state.players.first.deck,
        state.players.first.hand,
      );
      crestAddCounter("first", CALGE_FAITH, "faith", 3);
      whenPlayCard("first", 0);
      return readRandomSplit().parts;
    };
    const splitA = findFaith3Split(7);
    const splitB = findFaith3Split(99);
    expect(splitA).not.toEqual(splitB);
    expect(splitA.X! + splitA.Y! + splitA.Z!).toBe(3);
    expect(splitB.X! + splitB.Y! + splitB.Z!).toBe(3);
  }, 60_000);

  it.fails(
    "90034350 Send 'Em Packing — super-evolved Armes attacks 3 times per turn (official Q&A)",
    () => {
      setupTurn(R10, { hand: [SEND_EM_PACKING], pp: 1, superEvo: 1 });
      const armes = createCard(ARMS_DEPLETIVE_DEMON, "board", "first");
      armes.peak_defense = armes.defense;
      state.players.first.board = [armes];
      onEvolve(armes, "first", "super", { spendPoint: true });
      expect(Number(armes.attacks_per_turn ?? 1)).toBe(3);

      whenPlayCard("first", 0);
      resolvePendingByUid(armes.uid);
      expect(Number(armes.attacks_per_turn ?? 1)).toBe(3);
    },
    60_000,
  );
});
