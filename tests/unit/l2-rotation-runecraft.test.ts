/**
 * L2 real-card tests — Rotation Runecraft deck (43 cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  whenRunEffects,
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
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import {
  runStartOfTurnBoundary,
  runEndOfTurnBoundary,
} from "../../src/logic/core/turnBoundary.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import {
  faithCrestNameForCard,
  bootstrapFaithForPlayer,
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

// Deck cards
const CRYSTALSPAWN = "10631110";
const KITTY_CUNNING = "10532310";
const SUFRAMARE = "10431120";
const WITCHS_NEW_BREW = "10031210";
const ADVENT_ELD_CRYSTALS = "10631310";
const ALCHEMIC_FLARE = "10433310";
const HAPHAZARD_SNACKING = "10732310";
const LITTLE_BEASTIE = "10731120";
const POPPY = "10831120";
const PRETTY_PREDATOR = "10732120";
const ADVENTUROUS_GRIMOIRE = "10632120";
const BEWITCHING_ELD_CRYSTALS = "10633310";
const CHARMING_MONSTER = "10732110";
const DAZZLING_RUNEKNIGHT = "10031110";
const ELMOTT = "10433110";
const NOBLE_PHILOSOPHER = "10932120";
const PHILOSOPHIA = "10431110";
const SHYMM = "10634110";
const TERRAFORMING_WIZARD = "10531110";
const ARCANE_ERUPTION = "10032310";
const BOTTOMLESS_GLUTTONY = "10733310";
const CAGLIOSTRO = "10434120";
const DAINTY_HORROR = "10731110";
const HEEL_MY_DEARIE = "10731310";
const INSOMNIAC_WITCH = "10532110";
const REMI_RAMI = "10032110";
const SPELLBOUND_PROFESSOR = "10633110";
const UNLEASHED = "10432310";
const EARTH_SHATTERING_BOLT = "10832320";
const ENRAPTURED_STUDENT = "10632110";
const MIREILLE_RISETTE = "10432120";
const SWEET_ABOMINATION = "10733110";
const DAYDREAM_LIBRARIAN = "10631120";
const EZECRAIN = "10432110";
const WATERBENDING_CHARMWIELDER = "10531120";
const EMPEROR_OF_ELEMENTS = "10533110";
const GRANDEUR_DAWNBLOSSOM = "10533310";
const KEY_SPIRIT = "10931120";
const LILANTHIM = "10734110";
const RUNE_PORTAL = "10431310";
const BELOVED_MASTERPIECE = "10734120";
const BLAZE_DESTROYER = "10032120";
const CALGE_DANTHLA = "10634120";

// Tokens / helpers
const FORESIGHT = "10031310";
const FILLER = "10111310";
const GUARDIAN_GOLEM = "90031120";
const MYSTERIAN_MISSILE = "90031310";
const CARAVAN_MAMMOTH = "10002120";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const CLAY_GOLEM = "90031110";
const ARS_MAGNA = "90034320";
const DEPTHS_ELD_CRYSTALS = "90034330";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

const CALGE_FAITH = faithCrestNameForCard("Calge-Danthla, Eld Crystals");

function setupCalgeFaith(): void {
  bootstrapFaithForPlayer(
    "first",
    state.players.first.deck,
    state.players.first.hand,
  );
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

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | Record<string, unknown>>;
    pp?: number;
    hp?: number;
    secondDeck?: string[];
    active?: "first" | "second";
    evo?: number;
    superEvo?: number;
    seed?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand as any);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  else b = b.withSecondDeck(Array(10).fill(FILLER));
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
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

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
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

function earthSigilStack(player: "first" | "second" = "first"): number {
  return thenBoard(player)
    .filter((c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0)
    .reduce((sum, c) => sum + (c.counters?.earth ?? 0), 0);
}

function placeEarthSigils(
  n: number,
  player: "first" | "second" = "first",
): void {
  whenRunEffects(
    [
      {
        op: "summon",
        source: "named",
        name: "Magic Sediment",
        count: n,
      } as any,
    ],
    player,
    null,
  );
}

function hasKeyword(
  card: CardInstance | undefined | null,
  kw: string,
): boolean {
  if (!card) return false;
  const flag = `has${kw}` as keyof CardInstance;
  if ((card as any)[flag]) return true;
  if (
    card.keywords?.some(
      (k) => (typeof k === "string" ? k : (k as any)?.name) === kw,
    )
  )
    return true;
  return !!(card as any).keywordState?.[`has${kw}`];
}

function countOnBoardByName(
  name: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.name === name).length;
}

function countOnBoardById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.id === id).length;
}

function boardUids(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => c.uid);
}

function playForesights(n: number): void {
  for (let i = 0; i < n; i++) {
    whenPlayCard("first", 0);
  }
}

function boostCard(card: { uid: string; id?: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
}

function crestByName(name: string, player: "first" | "second" = "first") {
  return getCrests(state, player).find((c) => c.name === name);
}

describe("L2 Rotation Runecraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Crystalspawn (10631110)", () => {
    const printed = "Rush";

    it("has Rush on field when played", () => {
      setupTurn(R6, { hand: [CRYSTALSPAWN], pp: 1 });
      whenPlayCard("first", 0);
      const cs = findOnBoard("first", "Crystalspawn")!;
      expect(hasKeyword(cs, "Rush")).toBe(true);
      expect(printed).toContain("Rush");
    });
  });

  describe("Kitty Cunning (10532310)", () => {
    const printed =
      "Earth Rite (2) - Activate 2 random abilities from the following.\n1. Summon a Clay Golem.\n2. Restore 2 defense to your leader.\n3. Gain 3 earth sigils.";

    it("without Earth Rite (2): spell resolves with no random abilities", () => {
      setupTurn(R6, { hand: [KITTY_CUNNING], pp: 1, hp: 15 });
      const boardBefore = thenBoard("first").length;
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(thenBoard("first").length).toBe(boardBefore);
      expect(getHP(state, "first")).toBe(hpBefore);
      expect(earthSigilStack()).toBe(0);
      expect(printed).toContain("Earth Rite (2)");
    });

    it("with Earth Rite (2): activates 2 random abilities (seed 1)", () => {
      setupTurn(R6, { hand: [KITTY_CUNNING], pp: 1, hp: 15 });
      placeEarthSigils(2);
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      const changed =
        countOnBoardByName("Clay Golem") > 0 ||
        getHP(state, "first") > hpBefore ||
        earthSigilStack() >= 1;
      expect(changed).toBe(true);
    });
  });

  describe("Suframare, Wandering Tutor (10431120)", () => {
    const printed =
      "At the end of your turn, spellboost your hand X times. X is this follower's attack.\nEvolve: Give this follower \"Can't attack followers or leaders.\"";

    it("EOT spellboosts hand X times where X equals attack (1)", () => {
      setupTurn(R6, { hand: [SUFRAMARE, BLAZE_DESTROYER], pp: 1 });
      whenPlayCard("first", 0);
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(blaze);
      whenEndTurn();
      const sb1 = sbCount(blaze);
      expect(sb1 - sb0).toBe(1);
      expect(printed).toContain("X is this follower's attack");
    });

    it.fails(
      "EOT with buffed attack (3): spellboosts hand 3 times — printed: X is this follower's attack; observed: EOT uses base attack 1 (card 10431120)",
      () => {
        setupTurn(R6, { hand: [SUFRAMARE, BLAZE_DESTROYER], pp: 1 });
        whenPlayCard("first", 0);
        const suframare = findOnBoard("first", "Suframare, Wandering Tutor")!;
        whenRunEffects(
          [{ op: "stat", action: "give", target: "self", attack: 2 } as any],
          "first",
          suframare,
        );
        const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
        const sb0 = sbCount(blaze);
        whenEndTurn();
        expect(sbCount(blaze) - sb0).toBe(3);
      },
    );

    it("Evolve: gives Can't attack followers or leaders", () => {
      setupTurn(R6, { hand: [SUFRAMARE], pp: 1, evo: 2 });
      whenPlayCard("first", 0);
      const suframare = findOnBoard("first", "Suframare, Wandering Tutor")!;
      onEvolve(suframare, "first", "normal", { spendPoint: true });
      const cantAttack =
        hasKeyword(suframare, "cant_attack") ||
        suframare.can_attack === false ||
        suframare.can_attack_followers === false;
      expect(cantAttack).toBe(true);
      expect(printed).toContain("Can't attack");
    });
  });

  describe("Witch's New Brew (10031210)", () => {
    const printed =
      "Fanfare: Draw a card.\nEarth Sigil\nEngage (1): Gain an earth sigil.";

    it("Fanfare: draws the top stacked deck card", () => {
      setupTurn(R6, {
        hand: [WITCHS_NEW_BREW],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });

    it("enters as Earth Sigil amulet (stack of 1)", () => {
      setupTurn(R6, { hand: [WITCHS_NEW_BREW], deck: [FILLER], pp: 1 });
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(1);
      expect(printed).toContain("Earth Sigil");
    });

    it("Engage (1): gains an earth sigil (stack becomes 2)", () => {
      setupTurn(R6, { hand: [WITCHS_NEW_BREW], deck: [FILLER], pp: 2 });
      whenPlayCard("first", 0);
      const idx = thenBoard("first").findIndex(
        (c) => c.name === "Witch's New Brew",
      );
      engageAmulet("first", idx);
      expect(earthSigilStack()).toBe(2);
      expect(printed).toContain("Engage (1)");
    });
  });

  describe("Advent of the Eld Crystals (10631310)", () => {
    const printed = "Summon 2 copies of Crystalspawn.";

    it("summons exactly 2 Crystalspawn (10631110)", () => {
      setupTurn(R6, { hand: [ADVENT_ELD_CRYSTALS], pp: 2 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(CRYSTALSPAWN)).toBe(2);
      expect(handIds()).not.toContain(ADVENT_ELD_CRYSTALS);
      expect(printed).toContain("Summon 2 copies");
    });
  });

  describe("Alchemic Flare (10433310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 4 damage. Gain an earth sigil.\nSkybound Art- Deal 2 damage to the enemy leader.";

    it("deals 4 to selected enemy; bystander untouched; gains 1 sigil", () => {
      setupTurn(R6, { hand: [ALCHEMIC_FLARE], pp: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(1);
      expect(Number(bystander.defense)).toBe(5);
      expect(earthSigilStack()).toBe(1);
      expect(printed).toContain("deal it 4 damage");
    });

    it("without Skybound Art (10): does not deal 2 to enemy leader", () => {
      setupTurn(R6, { hand: [ALCHEMIC_FLARE], pp: 2 });
      enemyFollower(2, 5, "Target");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getHP(state, "second")).toBe(20);
    });

    it("Skybound Art (10): also deals 2 damage to enemy leader", () => {
      setupTurn(R10, { hand: [ALCHEMIC_FLARE], pp: 2 });
      enemyFollower(2, 5, "Target");
      for (let i = 0; i < 10; i++) incrementSkyboundArt("first");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Skybound Art");
    });
  });

  describe("Haphazard Snacking (10732310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Gain 4 earth sigils.\n2. Earth Rite (2) - Deal 2 damage to all enemy followers.";

    it("Mode 1: gains exactly 4 earth sigils", () => {
      setupTurn(R6, { hand: [HAPHAZARD_SNACKING], pp: 2 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(4);
      expect(printed).toContain("Gain 4 earth sigils");
    });

    it("Mode 2 without Earth Rite (2): deals no AoE damage", () => {
      setupTurn(R6, { hand: [HAPHAZARD_SNACKING], pp: 2 });
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(5);
      expect(Number(e2.defense)).toBe(5);
      expect(printed).toContain("Earth Rite (2)");
    });

    it("Mode 2 with Earth Rite (2): deals 2 to all enemy followers", () => {
      setupTurn(R6, { hand: [HAPHAZARD_SNACKING], pp: 2 });
      placeEarthSigils(2);
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(3);
      expect(Number(e2.defense)).toBe(3);
      expect(earthSigilStack()).toBe(0);
    });
  });

  describe("Little Beastie (10731120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 1 damage. Gain an earth sigil.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare: 1 damage to selected enemy; bystander untouched; gains 1 sigil", () => {
      setupTurn(R6, { hand: [LITTLE_BEASTIE], pp: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(5);
      expect(earthSigilStack()).toBe(1);
      expect(printed).toContain("deal it 1 damage");
    });

    it("Evolve: replicates Fanfare (another 1 damage + 1 sigil)", () => {
      setupTurn(R6, { hand: [LITTLE_BEASTIE], pp: 2, evo: 2 });
      const target = enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const sigilsAfterFanfare = earthSigilStack();
      const beastie = findOnBoard("first", "Little Beastie")!;
      onEvolve(beastie, "first", "normal", { spendPoint: true });
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(earthSigilStack()).toBe(sigilsAfterFanfare + 1);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Poppy, Mysterian Secretary (10831120)", () => {
    const printed = "Fanfare: Add a Mysterian Missile to your hand.";

    it("adds exactly one Mysterian Missile (90031310) to hand", () => {
      setupTurn(R6, { hand: [POPPY], pp: 2 });
      whenPlayCard("first", 0);
      const missiles = thenHand("first").filter(
        (c) => c.id === MYSTERIAN_MISSILE,
      );
      expect(missiles).toHaveLength(1);
      expect(printed).toContain("Mysterian Missile");
    });
  });

  describe("Pretty Predator (10732120)", () => {
    const printed = "Fanfare: Gain 2 earth sigils.\nWard";

    it("Fanfare: gains exactly 2 earth sigils", () => {
      setupTurn(R6, { hand: [PRETTY_PREDATOR], pp: 2 });
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(2);
      expect(printed).toContain("Gain 2 earth sigils");
    });

    it("has Ward on field", () => {
      setupTurn(R6, { hand: [PRETTY_PREDATOR], pp: 2 });
      whenPlayCard("first", 0);
      const pred = findOnBoard("first", "Pretty Predator")!;
      expect(hasKeyword(pred, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });
  });

  describe("Adventurous Grimoire (10632120)", () => {
    const printed =
      "Enhance (6): Summon 2 copies of Adventurous Grimoire.\nRush\nLast Words: Spellboost your hand.";

    it("at 3 PP: plays as single Rush follower without extra copies", () => {
      setupTurn(R6, { hand: [ADVENTUROUS_GRIMOIRE], pp: 3 });
      whenPlayCard("first", 0);
      const grimoires = thenBoard("first").filter(
        (c) => c.id === ADVENTUROUS_GRIMOIRE,
      );
      expect(grimoires).toHaveLength(1);
      expect(hasKeyword(grimoires[0]!, "Rush")).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Enhance (6): summons 2 copies plus the played body (3 total on board)", () => {
      setupTurn(R8, { hand: [ADVENTUROUS_GRIMOIRE], pp: 6 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(ADVENTUROUS_GRIMOIRE)).toBe(3);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Last Words: spellboosts cards in hand", () => {
      setupTurn(R6, {
        hand: [ADVENTUROUS_GRIMOIRE, BLAZE_DESTROYER],
        pp: 3,
      });
      whenPlayCard("first", 0);
      const grimoire = findOnBoard("first", "Adventurous Grimoire")!;
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(blaze);
      grimoire.defense = 0;
      cleanupDead();
      expect(sbCount(blaze)).toBeGreaterThan(sb0);
      expect(printed).toContain("Spellboost your hand");
    });
  });

  describe("Bewitching Eld Crystals (10633310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Summon a Crystalspawn and give it +1/+0 and Storm.\n2. Summon 2 copies of Crystalspawn and give them +1/+0.\nEnhance (5): Activate all of them instead.";

    it("Mode 1: summons 1 Crystalspawn with +1/+0 and Storm", () => {
      setupTurn(R6, { hand: [BEWITCHING_ELD_CRYSTALS], pp: 3 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const cs = thenBoard("first").filter((c) => c.id === CRYSTALSPAWN);
      expect(cs).toHaveLength(1);
      expect(Number(cs[0]!.attack)).toBe(2);
      expect(hasKeyword(cs[0]!, "Storm")).toBe(true);
      expect(printed).toContain("Storm");
    });

    it("Mode 2: summons 2 Crystalspawn each with +1/+0", () => {
      setupTurn(R6, { hand: [BEWITCHING_ELD_CRYSTALS], pp: 3 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const cs = thenBoard("first").filter((c) => c.id === CRYSTALSPAWN);
      expect(cs).toHaveLength(2);
      expect(cs.every((c) => Number(c.attack) === 2)).toBe(true);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Enhance (5): activates both modes (3 Crystalspawn total)", () => {
      setupTurn(R7, { hand: [BEWITCHING_ELD_CRYSTALS], pp: 5 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(CRYSTALSPAWN)).toBe(3);
      expect(printed).toContain("Activate all of them");
    });
  });

  describe("Charming Monster (10732110)", () => {
    const printed =
      "Rush\nLast Words: Gain 2 earth sigils.\nSuper-Evolve: Earth Rite (2) - Summon 2 copies of Charming Monster.";

    it("has Rush on field", () => {
      setupTurn(R6, { hand: [CHARMING_MONSTER], pp: 3 });
      whenPlayCard("first", 0);
      const cm = findOnBoard("first", "Charming Monster")!;
      expect(hasKeyword(cm, "Rush")).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Last Words: gains exactly 2 earth sigils", () => {
      setupTurn(R6, { hand: [CHARMING_MONSTER], pp: 3 });
      whenPlayCard("first", 0);
      const cm = findOnBoard("first", "Charming Monster")!;
      cm.defense = 0;
      cleanupDead();
      expect(earthSigilStack()).toBe(2);
      expect(printed).toContain("Gain 2 earth sigils");
    });

    it("Super-Evolve without Earth Rite (2): summons 0 extra copies", () => {
      setupTurn(R7, { hand: [CHARMING_MONSTER], pp: 3, superEvo: 1 });
      whenPlayCard("first", 0);
      const cm = findOnBoard("first", "Charming Monster")!;
      onEvolve(cm, "first", "super", { spendPoint: true });
      expect(countOnBoardByName("Charming Monster")).toBe(1);
      expect(printed).toContain("Earth Rite (2)");
    });

    it("Super-Evolve with Earth Rite (2): summons 2 copies of Charming Monster", () => {
      setupTurn(R7, { hand: [CHARMING_MONSTER], pp: 3, superEvo: 1 });
      placeEarthSigils(2);
      whenPlayCard("first", 0);
      const cm = findOnBoard("first", "Charming Monster")!;
      onEvolve(cm, "first", "super", { spendPoint: true });
      expect(countOnBoardByName("Charming Monster")).toBe(3);
    });
  });

  describe("Dazzling Runeknight (10031110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Spellboost your hand 2 times.\n2. Earth Rite (1) - Give this follower +2/+2 and Ward";

    it("Mode 1: spellboosts hand exactly 2 times", () => {
      setupTurn(R6, { hand: [DAZZLING_RUNEKNIGHT, BLAZE_DESTROYER], pp: 3 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      expect(sbCount(blaze)).toBe(2);
      expect(printed).toContain("Spellboost your hand 2 times");
    });

    it("Mode 2 without Earth Rite (1): no +2/+2 Ward buff", () => {
      setupTurn(R6, { hand: [DAZZLING_RUNEKNIGHT], pp: 3 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const knight = findOnBoard("first", "Dazzling Runeknight")!;
      expect(Number(knight.attack)).toBe(2);
      expect(Number(knight.defense)).toBe(2);
      expect(hasKeyword(knight, "Ward")).toBe(false);
      expect(printed).toContain("Earth Rite (1)");
    });

    it("Mode 2 with Earth Rite (1): gives +2/+2 and Ward", () => {
      setupTurn(R6, { hand: [DAZZLING_RUNEKNIGHT], pp: 3 });
      placeEarthSigils(1);
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const knight = findOnBoard("first", "Dazzling Runeknight")!;
      expect(Number(knight.attack)).toBe(4);
      expect(Number(knight.defense)).toBe(4);
      expect(hasKeyword(knight, "Ward")).toBe(true);
      expect(earthSigilStack()).toBe(0);
    });
  });

  describe("Elmott, Remembrance Aflame (10433110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field, remove all abilities from it, and deal it 3 damage.\nSuper-Evolve: Gain Crest: Elmott, Remembrance Aflame.";

    it("Fanfare: silences selected enemy and deals 3; bystander untouched", () => {
      setupTurn(R6, { hand: [ELMOTT], pp: 3 });
      const target = enemyFollower(2, 5, "Target");
      applyKeywordsFromList(target);
      target.hasWard = true;
      const bystander = enemyFollower(2, 5, "Bystander");
      applyKeywordsFromList(bystander);
      bystander.hasWard = true;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(target.hasWard).toBeFalsy();
      expect(Number(target.defense)).toBe(2);
      expect(bystander.hasWard).toBe(true);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("remove all abilities");
    });

    it("Super-Evolve: gains crest with start-of-turn 1 leader damage text", () => {
      setupTurn(R7, { hand: [ELMOTT], pp: 3, superEvo: 1 });
      whenPlayCard("first", 0);
      const elmott = findOnBoard("first", "Elmott, Remembrance Aflame")!;
      onEvolve(elmott, "first", "super", { spendPoint: true });
      const crest = crestByName("Elmott, Remembrance Aflame")!;
      expect(crest).toBeDefined();
      expect(crest!.description).toContain(
        "At the start of your turn, deal 1 damage to the enemy leader",
      );
      expect(printed).toContain("Crest: Elmott");
    });

    it("crest at start of turn: deals 1 to enemy leader", () => {
      setupTurn(R7, { hand: [ELMOTT], pp: 3, superEvo: 1 });
      whenPlayCard("first", 0);
      const elmott = findOnBoard("first", "Elmott, Remembrance Aflame")!;
      onEvolve(elmott, "first", "super", { spendPoint: true });
      state.players.second.hp = 20;
      runStartOfTurnBoundary("first");
      expect(getHP(state, "second")).toBe(19);
    });
  });

  describe("Noble Philosopher (10932120)", () => {
    const printed =
      "Fanfare: Return your hand to deck. Draw X cards. X is the number of cards you returned.";

    it("returns all hand cards to deck and draws equal count", () => {
      setupTurn(R6, {
        hand: [NOBLE_PHILOSOPHER, FILLER, FILLER],
        deck: [DRAW_TOP, DRAW_SECOND, FILLER, FILLER],
        pp: 3,
      });
      whenPlayCard("first", 0);
      expect(getHand(state, "first").length).toBe(2);
      expect(handIds()).not.toContain(NOBLE_PHILOSOPHER);
      expect(printed).toContain("Draw X cards");
    });
  });

  describe("Philosophia, Cryptic Sophist (10431110)", () => {
    const printed = "Fanfare: Draw a spell.";

    it("draws a spell from stacked deck into hand", () => {
      setupTurn(R6, {
        hand: [PHILOSOPHIA],
        deck: [FILLER, FORESIGHT],
        pp: 3,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(FORESIGHT);
      expect(printed).toContain("Draw a spell");
    });
  });

  describe("Shymm, Love Bewitched (10634110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Crystalspawn.\nDrain\nSuper-Evolve: Gain Crest: Shymm, Love Bewitched.";

    it("Fanfare: summons exactly 2 Crystalspawn", () => {
      setupTurn(R6, { hand: [SHYMM], pp: 3 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(CRYSTALSPAWN)).toBe(2);
      expect(printed).toContain("Summon 2 copies");
    });

    it("has Drain on field", () => {
      setupTurn(R6, { hand: [SHYMM], pp: 3 });
      whenPlayCard("first", 0);
      const shymm = findOnBoard("first", "Shymm, Love Bewitched")!;
      expect(hasKeyword(shymm, "Drain")).toBe(true);
      expect(printed).toContain("Drain");
    });

    it("Super-Evolve: gains crest — Crystalspawn attacks get +1/+0", () => {
      setupTurn(R7, { hand: [SHYMM], pp: 3, superEvo: 1 });
      whenPlayCard("first", 0);
      const shymm = findOnBoard("first", "Shymm, Love Bewitched")!;
      onEvolve(shymm, "first", "super", { spendPoint: true });
      const crest = crestByName("Shymm, Love Bewitched")!;
      expect(crest).toBeDefined();
      expect(crest!.description).toContain(
        "Whenever an allied Crystalspawn attacks, give it +1/+0",
      );
      const cs = thenBoard("first").find((c) => c.id === CRYSTALSPAWN)!;
      const atk0 = Number(cs.attack);
      fireTrigger("ally_follower_attacked", "first", {
        attacker: cs,
        defender: cs,
      });
      expect(Number(cs.attack)).toBe(atk0 + 1);
    });
  });

  describe("Terraforming Wizard (10531110)", () => {
    const printed =
      "Fanfare: Gain 2 earth sigils.\nSuper-Evolve: Summon 2 copies of Guardian Golem.";

    it("Fanfare: gains exactly 2 earth sigils", () => {
      setupTurn(R6, { hand: [TERRAFORMING_WIZARD], pp: 3 });
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(2);
      expect(printed).toContain("Gain 2 earth sigils");
    });

    it("Super-Evolve: summons exactly 2 Guardian Golem (90031120)", () => {
      setupTurn(R7, { hand: [TERRAFORMING_WIZARD], pp: 3, superEvo: 1 });
      whenPlayCard("first", 0);
      const wizard = findOnBoard("first", "Terraforming Wizard")!;
      onEvolve(wizard, "first", "super", { spendPoint: true });
      expect(countOnBoardById(GUARDIAN_GOLEM)).toBe(2);
      expect(printed).toContain("Guardian Golem");
    });
  });

  describe("Arcane Eruption (10032310)", () => {
    const printed =
      "Deal 2 damage to all followers. Earth Rite (1) - Draw a card.";

    it("deals 2 to all followers on both sides", () => {
      setupTurn(R6, { hand: [ARCANE_ERUPTION], pp: 4 });
      const ally = allyFollower(2, 5, "Ally");
      const enemy = enemyFollower(2, 5, "Enemy");
      whenPlayCard("first", 0);
      expect(Number(ally.defense)).toBe(3);
      expect(Number(enemy.defense)).toBe(3);
      expect(printed).toContain("Deal 2 damage to all followers");
    });

    it("without Earth Rite (1): does not draw", () => {
      setupTurn(R6, {
        hand: [ARCANE_ERUPTION],
        deck: [DRAW_TOP],
        pp: 4,
      });
      const handBefore = getHand(state, "first").length;
      whenPlayCard("first", 0);
      expect(getHand(state, "first").length).toBe(handBefore - 1);
      expect(handIds()).not.toContain(DRAW_TOP);
    });

    it("with Earth Rite (1): draws top stacked deck card", () => {
      setupTurn(R6, {
        hand: [ARCANE_ERUPTION],
        deck: [DRAW_TOP],
        pp: 4,
      });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(earthSigilStack()).toBe(0);
      expect(printed).toContain("Draw a card");
    });
  });

  describe("Bottomless Gluttony (10733310)", () => {
    const printed =
      "Activates in hand. Whenever you perform Earth Rite, reduce the cost of this card by 1.\nSelect an enemy follower on the field and destroy it. Gain 2 earth sigils.";

    it("in hand: Earth Rite performed elsewhere reduces cost by 1", () => {
      setupTurn(R6, {
        hand: [BOTTOMLESS_GLUTTONY, DAZZLING_RUNEKNIGHT],
        pp: 6,
      });
      placeEarthSigils(1);
      const gluttony = thenHand("first").find(
        (c) => c.id === BOTTOMLESS_GLUTTONY,
      )!;
      const cost0 = getEffectiveCost(gluttony, "first");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 1);
      const cost1 = getEffectiveCost(
        thenHand("first").find((c) => c.id === BOTTOMLESS_GLUTTONY)!,
        "first",
      );
      expect(cost1).toBe(cost0 - 1);
      expect(printed).toContain("reduce the cost");
    });

    it("destroys selected enemy; bystander untouched; gains 2 sigils", () => {
      setupTurn(R6, { hand: [BOTTOMLESS_GLUTTONY], pp: 4 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(0);
      expect(Number(bystander.defense)).toBe(5);
      expect(earthSigilStack()).toBe(2);
      expect(printed).toContain("destroy it");
    });
  });

  describe("Cagliostro, Genius Alchemist (10434120)", () => {
    const printed =
      "Fanfare: Gain 2 earth sigils. Add an Ars Magna to your hand.\nSkybound Art- Evolve this follower.\nSuper Skybound Art- Gain Crest: Cagliostro, Genius Alchemist.";

    it("Fanfare: gains 2 sigils and adds Ars Magna to hand", () => {
      setupTurn(R6, { hand: [CAGLIOSTRO], pp: 4 });
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(2);
      expect(handIds()).toContain(ARS_MAGNA);
      expect(printed).toContain("Ars Magna");
    });

    it("without Skybound Art (10): does not auto-evolve on Fanfare", () => {
      setupTurn(R6, { hand: [CAGLIOSTRO], pp: 4 });
      whenPlayCard("first", 0);
      const cag = findOnBoard("first", "Cagliostro, Genius Alchemist")!;
      expect(cag.hasEvolved).toBeFalsy();
    });

    it("Skybound Art (10): evolves self on Fanfare", () => {
      setupTurn(R10, { hand: [CAGLIOSTRO], pp: 4 });
      for (let i = 0; i < 10; i++) incrementSkyboundArt("first");
      const cag = state.players.first.hand[0]!;
      cag.skyboundArtEvolvesWitnessed = 10;
      whenPlayCard("first", 0);
      const onBoard = findOnBoard("first", "Cagliostro, Genius Alchemist")!;
      expect(onBoard.hasEvolved).toBe(true);
      expect(printed).toContain("Skybound Art");
    });

    it("Super Skybound Art (15): gains crest — start turn Earth Rite add Ars Magna", () => {
      setupTurn(R10, { hand: [CAGLIOSTRO], pp: 4 });
      for (let i = 0; i < 15; i++) incrementSkyboundArt("first");
      const cag = state.players.first.hand[0]!;
      cag.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      const crest = crestByName("Cagliostro, Genius Alchemist")!;
      expect(crest).toBeDefined();
      expect(crest!.description).toContain(
        "At the start of your turn, Earth Rite (1) - Add an Ars Magna to your hand",
      );
      placeEarthSigils(1);
      const handBefore = handIds().length;
      runStartOfTurnBoundary("first");
      expect(handIds().length).toBe(handBefore + 1);
      expect(handIds()).toContain(ARS_MAGNA);
    });
  });

  describe("Dainty Horror (10731110)", () => {
    const printed = "Fanfare: Earth Rite (1) - Evolve this follower.\nWard";

    it("without Earth Rite (1): does not evolve on Fanfare", () => {
      setupTurn(R6, { hand: [DAINTY_HORROR], pp: 4 });
      whenPlayCard("first", 0);
      const horror = findOnBoard("first", "Dainty Horror")!;
      expect(horror.hasEvolved).toBeFalsy();
      expect(printed).toContain("Earth Rite (1)");
    });

    it("with Earth Rite (1): evolves on Fanfare", () => {
      setupTurn(R6, { hand: [DAINTY_HORROR], pp: 4 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      const horror = findOnBoard("first", "Dainty Horror")!;
      expect(horror.hasEvolved).toBe(true);
      expect(earthSigilStack()).toBe(0);
    });

    it("has Ward on field", () => {
      setupTurn(R6, { hand: [DAINTY_HORROR], pp: 4 });
      whenPlayCard("first", 0);
      const horror = findOnBoard("first", "Dainty Horror")!;
      expect(hasKeyword(horror, "Ward")).toBe(true);
    });
  });

  describe("Heel, My Dearie (10731310)", () => {
    const printed =
      "Activates in hand. Whenever you perform Earth Rite, reduce the cost of this card by 1.\nDraw 2 cards. Gain an earth sigil.";

    it("in hand: Earth Rite reduces cost by 1", () => {
      setupTurn(R6, { hand: [HEEL_MY_DEARIE, DAZZLING_RUNEKNIGHT], pp: 6 });
      placeEarthSigils(1);
      const dearie = thenHand("first").find((c) => c.id === HEEL_MY_DEARIE)!;
      const cost0 = getEffectiveCost(dearie, "first");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 1);
      const cost1 = getEffectiveCost(
        thenHand("first").find((c) => c.id === HEEL_MY_DEARIE)!,
        "first",
      );
      expect(cost1).toBe(cost0 - 1);
    });

    it("draws 2 stacked cards and gains 1 earth sigil", () => {
      setupTurn(R6, {
        hand: [HEEL_MY_DEARIE],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 4,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(earthSigilStack()).toBe(1);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Insomniac Witch (10532110)", () => {
    const printed =
      "Fanfare: Gain Crest: Insomniac Witch.\nEvolve: Destroy your Crest: Insomniac Witch.";

    it("Fanfare: gains crest with Countdown (2) Last Words 3 to all followers text", () => {
      setupTurn(R7, { hand: [INSOMNIAC_WITCH], pp: 4 });
      whenPlayCard("first", 0);
      const crest = crestByName("Insomniac Witch")!;
      expect(crest).toBeDefined();
      expect(crest!.description).toContain("Countdown (2)");
      expect(crest!.description).toContain("Deal 3 damage to all followers");
      expect(printed).toContain("Crest: Insomniac Witch");
    });

    it("Evolve: destroys Insomniac Witch crest", () => {
      setupTurn(R7, { hand: [INSOMNIAC_WITCH], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const witch = findOnBoard("first", "Insomniac Witch")!;
      onEvolve(witch, "first", "normal", { spendPoint: true });
      expect(crestByName("Insomniac Witch")).toBeUndefined();
      expect(printed).toContain("Destroy your Crest");
    });

    it("crest Countdown (2) Last Words: after two owner turn-starts deals 3 to all followers", () => {
      setupTurn(R7, { hand: [INSOMNIAC_WITCH], pp: 4 });
      const ally = allyFollower(2, 5, "Ally");
      const enemy = enemyFollower(2, 5, "Enemy");
      whenPlayCard("first", 0);
      expect(Number(crestByName("Insomniac Witch")!.countdown)).toBe(2);
      whenEndTurn();
      whenEndTurn();
      runStartOfTurnBoundary("first");
      expect(Number(crestByName("Insomniac Witch")!.countdown)).toBe(1);
      whenEndTurn();
      whenEndTurn();
      runStartOfTurnBoundary("first");
      expect(crestByName("Insomniac Witch")).toBeUndefined();
      expect(Number(ally.defense)).toBe(2);
      expect(Number(enemy.defense)).toBe(2);
    });
  });

  describe("Remi & Rami, Two-Faced Witch (10032110)", () => {
    const printed =
      "Fanfare: Earth Rite (1) - Summon a Guardian Golem.\nSuper-Evolve: Select an allied Golem follower on the field, evolve it, and give it +3/+3.";

    it("without Earth Rite (1): does not summon Guardian Golem", () => {
      setupTurn(R6, { hand: [REMI_RAMI], pp: 4 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(GUARDIAN_GOLEM)).toBe(0);
      expect(printed).toContain("Earth Rite (1)");
    });

    it("with Earth Rite (1): summons exactly 1 Guardian Golem", () => {
      setupTurn(R6, { hand: [REMI_RAMI], pp: 4 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      expect(countOnBoardById(GUARDIAN_GOLEM)).toBe(1);
      expect(earthSigilStack()).toBe(0);
    });

    it("Super-Evolve: evolves selected Golem and gives +3/+3", () => {
      setupTurn(R7, { hand: [REMI_RAMI], pp: 4, superEvo: 1 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      const remi = findOnBoard("first", "Remi & Rami, Two-Faced Witch")!;
      const golem = thenBoard("first").find((c) => c.id === GUARDIAN_GOLEM)!;
      onEvolve(remi, "first", "super", { spendPoint: true });
      resolvePendingByUid(golem.uid);
      expect(golem.hasEvolved).toBe(true);
      expect(Number(golem.attack)).toBe(8);
      expect(Number(golem.defense)).toBe(8);
      expect(printed).toContain("+3/+3");
    });
  });

  describe("Spellbound Professor (10633110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Crystalspawn.\nEvolve: Give all allied copies of Crystalspawn on the field +1/+0.";

    it("Fanfare: summons exactly 2 Crystalspawn", () => {
      setupTurn(R6, { hand: [SPELLBOUND_PROFESSOR], pp: 4 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(CRYSTALSPAWN)).toBe(2);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Evolve: gives all allied Crystalspawn +1/+0", () => {
      setupTurn(R6, { hand: [SPELLBOUND_PROFESSOR], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const spawns = thenBoard("first").filter((c) => c.id === CRYSTALSPAWN);
      const professor = findOnBoard("first", "Spellbound Professor")!;
      onEvolve(professor, "first", "normal", { spendPoint: true });
      expect(spawns.every((c) => Number(c.attack) === 2)).toBe(true);
      expect(printed).toContain("+1/+0");
    });
  });

  describe("Unleashed (10432310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Draw a card. Deal 4 damage to a random enemy follower.\n2. Draw 2 cards. Deal 4 damage to 2 random enemy followers and 2 damage to your leader.";

    it("Mode 1: draws 1 and deals 4 to a random enemy (seed 1)", () => {
      setupTurn(R6, {
        hand: [UNLEASHED],
        deck: [DRAW_TOP],
        pp: 4,
      });
      const target = enemyFollower(2, 5, "Target");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(5 - Number(target.defense)).toBe(4);
      expect(printed).toContain("Deal 4 damage");
    });

    it("Mode 2: draws 2, deals 4+4 random to enemies and 2 to your leader", () => {
      setupTurn(R6, {
        hand: [UNLEASHED],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 4,
        hp: 20,
      });
      enemyFollower(2, 6, "E1");
      enemyFollower(2, 6, "E2");
      const hpBefore = getHP(state, "first");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(getHP(state, "first")).toBe(hpBefore - 2);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Earth-Shattering Bolt (10832320)", () => {
    const printed =
      "Deal 8 damage to a random enemy follower with the highest attack. Deal 2 damage to the enemy leader. Earth Rite (2) - Add an Earth-Shattering Bolt to your hand.";

    it("deals 8 to highest-attack enemy and 2 to leader (seed 1)", () => {
      setupTurn(R8, { hand: [EARTH_SHATTERING_BOLT], pp: 5 });
      const low = enemyFollower(2, 10, "Low");
      const high = enemyFollower(5, 10, "High");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(Number(high.defense)).toBe(2);
      expect(Number(low.defense)).toBe(10);
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("highest attack");
    });

    it("without Earth Rite (2): does not add copy to hand", () => {
      setupTurn(R8, { hand: [EARTH_SHATTERING_BOLT], pp: 5 });
      enemyFollower(5, 10, "High");
      whenPlayCard("first", 0);
      expect(
        handIds().filter((id) => id === EARTH_SHATTERING_BOLT),
      ).toHaveLength(0);
    });

    it("with Earth Rite (2): adds Earth-Shattering Bolt to hand", () => {
      setupTurn(R8, { hand: [EARTH_SHATTERING_BOLT], pp: 5 });
      placeEarthSigils(2);
      enemyFollower(5, 10, "High");
      whenPlayCard("first", 0);
      expect(
        handIds().filter((id) => id === EARTH_SHATTERING_BOLT),
      ).toHaveLength(1);
      expect(earthSigilStack()).toBe(0);
    });
  });

  describe("Enraptured Student (10632110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Crystalspawn.\nWhenever an allied Crystalspawn enters the field, restore 1 defense to your leader.";

    it("Fanfare: summons exactly 2 Crystalspawn", () => {
      setupTurn(R7, { hand: [ENRAPTURED_STUDENT], pp: 5, hp: 15 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(CRYSTALSPAWN)).toBe(2);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Crystalspawn enter: restores 1 defense to leader", () => {
      setupTurn(R7, {
        hand: [ENRAPTURED_STUDENT, CRYSTALSPAWN],
        pp: 6,
        hp: 15,
      });
      whenPlayCard("first", 0);
      const hpAfterFanfare = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpAfterFanfare + 1);
      expect(printed).toContain("restore 1 defense");
    });
  });

  describe("Mireille & Risette, Penitent Duo (10432120)", () => {
    const printed =
      "Fanfare: Summon a Mireille & Risette, Penitent Duo. Earth Rite(2) - Evolve it and this follower.";

    it("Fanfare: summons exactly 1 copy of Mireille & Risette", () => {
      setupTurn(R8, { hand: [MIREILLE_RISETTE], pp: 5 });
      whenPlayCard("first", 0);
      expect(countOnBoardByName("Mireille & Risette, Penitent Duo")).toBe(2);
      expect(printed).toContain("Summon a Mireille");
    });

    it("without Earth Rite (2): neither copy evolves", () => {
      setupTurn(R8, { hand: [MIREILLE_RISETTE], pp: 5 });
      whenPlayCard("first", 0);
      const copies = thenBoard("first").filter(
        (c) => c.name === "Mireille & Risette, Penitent Duo",
      );
      expect(copies.every((c) => !c.hasEvolved)).toBe(true);
    });

    it("with Earth Rite (2): evolves both copies", () => {
      setupTurn(R8, { hand: [MIREILLE_RISETTE], pp: 5 });
      placeEarthSigils(2);
      whenPlayCard("first", 0);
      const copies = thenBoard("first").filter(
        (c) => c.name === "Mireille & Risette, Penitent Duo",
      );
      expect(copies.every((c) => c.hasEvolved)).toBe(true);
      expect(earthSigilStack()).toBe(0);
    });
  });

  describe("Sweet Abomination (10733110)", () => {
    const printed =
      "Fanfare: Earth Rite (1) - Select a Mode to activate.\n1. Deal 3 damage to all enemy followers.\n2. Draw 2 cards.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("without Earth Rite (1): Fanfare does not offer modes", () => {
      setupTurn(R7, { hand: [SWEET_ABOMINATION], pp: 5 });
      const enemy = enemyFollower(2, 5, "Enemy");
      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(Number(enemy.defense)).toBe(5);
      expect(printed).toContain("Earth Rite (1)");
    });

    it("Mode 1 with Earth Rite: deals 3 to all enemy followers", () => {
      setupTurn(R7, { hand: [SWEET_ABOMINATION], pp: 5 });
      placeEarthSigils(1);
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(2);
      expect(Number(e2.defense)).toBe(2);
      expect(printed).toContain("Deal 3 damage");
    });

    it("Mode 2 with Earth Rite: draws 2 stacked cards", () => {
      setupTurn(R7, {
        hand: [SWEET_ABOMINATION],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 5,
      });
      placeEarthSigils(1);
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
    });

    it("Evolve with Earth Rite: replicates Fanfare mode", () => {
      setupTurn(R7, { hand: [SWEET_ABOMINATION], pp: 5, evo: 2 });
      placeEarthSigils(2);
      const enemy = enemyFollower(2, 5, "Enemy");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const abom = findOnBoard("first", "Sweet Abomination")!;
      setScriptedModePickProvider(() => [0]);
      onEvolve(abom, "first", "normal", { spendPoint: true });
      expect(Number(enemy.defense)).toBe(0);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Daydream Librarian (10631120)", () => {
    const printed =
      "Fanfare: Summon a Caravan Mammoth.\nSuper-Evolve: Give all other allied followers on the field Rush.";

    it("Fanfare: summons Caravan Mammoth (10002120)", () => {
      setupTurn(R8, { hand: [DAYDREAM_LIBRARIAN], pp: 6 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(CARAVAN_MAMMOTH)).toBe(1);
      expect(printed).toContain("Caravan Mammoth");
    });

    it("Super-Evolve: gives Rush to other allied followers only", () => {
      setupTurn(R8, { hand: [DAYDREAM_LIBRARIAN], pp: 6, superEvo: 1 });
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      const librarian = findOnBoard("first", "Daydream Librarian")!;
      onEvolve(librarian, "first", "super", { spendPoint: true });
      expect(hasKeyword(ally, "Rush")).toBe(true);
      expect(hasKeyword(librarian, "Rush")).toBe(false);
      expect(printed).toContain("all other allied followers");
    });
  });

  describe("Ezecrain, Portent of Vengeance (10432110)", () => {
    const printed =
      "Fanfare: Select 2 enemy followers on the field and deal them 4 damage. Gain 2 earth sigils.";

    it("deals 4 to 2 selected enemies; gains 2 sigils", () => {
      setupTurn(R10, { hand: [EZECRAIN], pp: 6 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(a.uid);
      resolvePendingByUid(b.uid);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(6);
      expect(earthSigilStack()).toBe(2);
      expect(printed).toContain("deal them 4 damage");
    });
  });

  describe("Waterbending Charmwielder (10531120)", () => {
    const printed =
      "Fanfare: Deal 3 damage to 3 random enemy followers. Spellboost your hand 3 times.";

    it("deals 3 damage split across 3 random enemies (seed 1) and spellboosts hand 3 times", () => {
      setupTurn(R10, {
        hand: [WATERBENDING_CHARMWIELDER, BLAZE_DESTROYER],
        pp: 6,
      });
      enemyFollower(2, 5, "E1");
      enemyFollower(2, 5, "E2");
      enemyFollower(2, 5, "E3");
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(blaze);
      whenPlayCard("first", 0);
      const totalDmg = thenBoard("second").reduce(
        (s, c) => s + (5 - Math.max(0, Number(c.defense))),
        0,
      );
      expect(totalDmg).toBe(9);
      expect(sbCount(blaze)).toBe(sb0 + 3);
      expect(printed).toContain("Spellboost your hand 3 times");
    });
  });

  describe("Emperor of Elements (10533110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Guardian Golem.\nWhenever an allied Golem follower enters the field, Earth Rite (1) - Evolve it.";

    it("Fanfare: summons exactly 2 Guardian Golem", () => {
      setupTurn(R10, { hand: [EMPEROR_OF_ELEMENTS], pp: 7 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(GUARDIAN_GOLEM)).toBe(2);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Golem enter without Earth Rite (1): does not evolve", () => {
      setupTurn(R10, { hand: [EMPEROR_OF_ELEMENTS], pp: 7 });
      whenPlayCard("first", 0);
      const golem = thenBoard("first").find((c) => c.id === GUARDIAN_GOLEM)!;
      expect(golem.hasEvolved).toBeFalsy();
    });

    it("with Earth Rite (1): first Golem entering evolves; second does not without another sigil", () => {
      setupTurn(R10, { hand: [EMPEROR_OF_ELEMENTS], pp: 7 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      const golems = thenBoard("first").filter((c) => c.id === GUARDIAN_GOLEM);
      expect(golems).toHaveLength(2);
      const evolvedCount = golems.filter((g) => g.hasEvolved).length;
      expect(evolvedCount).toBe(1);
      expect(printed).toContain("Earth Rite (1)");
    });

    it("with Earth Rite (2): both Fanfare Golems evolve", () => {
      setupTurn(R10, { hand: [EMPEROR_OF_ELEMENTS], pp: 7 });
      placeEarthSigils(2);
      whenPlayCard("first", 0);
      const golems = thenBoard("first").filter((c) => c.id === GUARDIAN_GOLEM);
      expect(golems).toHaveLength(2);
      expect(golems.filter((g) => g.hasEvolved)).toHaveLength(2);
    });
  });

  describe("Grandeur of the Dawnblossom (10533310)", () => {
    const printed =
      "Transform all allied followers on the field into exact copies of random followers in your deck.";

    it("transforms allied followers into deck copies (seed 1)", () => {
      setupTurn(R10, {
        hand: [GRANDEUR_DAWNBLOSSOM],
        deck: [CRYSTALSPAWN, GUARDIAN_GOLEM, FILLER],
        pp: 7,
      });
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      const transformed = thenBoard("first").filter((c) => c.uid !== ally.uid);
      expect(transformed.length).toBe(0);
      const result = findOnBoard("first", "Ally") ?? thenBoard("first")[0];
      expect(
        [CRYSTALSPAWN, GUARDIAN_GOLEM, FILLER].includes(String(result?.id)),
      ).toBe(true);
      expect(printed).toContain("Transform all allied followers");
    });
  });

  describe("Key Spirit (10931120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 7 damage. Deal 4 damage to the enemy leader.\nEvolve: Select a card in your hand with On Spellboost and spellboost it 4 times.";

    it("Fanfare: 7 to selected enemy; bystander untouched; 4 to leader", () => {
      setupTurn(R10, { hand: [KEY_SPIRIT], pp: 7 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(1);
      expect(Number(bystander.defense)).toBe(8);
      expect(getHP(state, "second")).toBe(16);
      expect(printed).toContain("deal it 7 damage");
    });

    it("Evolve: spellboosts selected On Spellboost card 4 times", () => {
      setupTurn(R10, {
        hand: [KEY_SPIRIT, BLAZE_DESTROYER],
        pp: 7,
        evo: 2,
      });
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      if (state.pendingTargetEffect) resolveFirstPending();
      const spirit = findOnBoard("first", "Key Spirit")!;
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      onEvolve(spirit, "first", "normal", { spendPoint: true });
      resolvePendingByUid(blaze.uid);
      expect(sbCount(blaze)).toBe(4);
      expect(printed).toContain("spellboost it 4 times");
    });
  });

  describe("Lilanthim, Anathema of Predation (10734110)", () => {
    const printed =
      "Fanfare: Earth Rite (1) - Gain Crest: Lilanthim, Anathema of Predation.\nAura\nEvolve: Earth Rite (1) - Select an enemy follower on the field and destroy it.";

    it("without Earth Rite (1): Fanfare does not gain crest", () => {
      setupTurn(R10, { hand: [LILANTHIM], pp: 7 });
      whenPlayCard("first", 0);
      expect(crestByName("Lilanthim, Anathema of Predation")).toBeUndefined();
      expect(printed).toContain("Earth Rite (1)");
    });

    it("with Earth Rite (1): gains crest with opponent EOT summon+evolve text", () => {
      setupTurn(R10, { hand: [LILANTHIM], pp: 7 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      const crest = crestByName("Lilanthim, Anathema of Predation")!;
      expect(crest).toBeDefined();
      expect(crest.description).toContain(
        "At the end of your opponent's turn, summon a Lilanthim, Anathema of Predation and evolve it",
      );
    });

    it("has Aura on field", () => {
      setupTurn(R10, { hand: [LILANTHIM], pp: 7 });
      whenPlayCard("first", 0);
      const lil = findOnBoard("first", "Lilanthim, Anathema of Predation")!;
      expect(hasKeyword(lil, "Aura")).toBe(true);
      expect(printed).toContain("Aura");
    });

    it("Evolve without Earth Rite (1): does not destroy enemy", () => {
      setupTurn(R10, { hand: [LILANTHIM], pp: 7, evo: 2 });
      whenPlayCard("first", 0);
      const enemy = enemyFollower(2, 5, "Enemy");
      const lil = findOnBoard("first", "Lilanthim, Anathema of Predation")!;
      onEvolve(lil, "first", "normal", { spendPoint: true });
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(Number(enemy.defense)).toBe(5);
    });

    it("Evolve with Earth Rite (1): destroys selected enemy; bystander untouched", () => {
      setupTurn(R10, { hand: [LILANTHIM], pp: 7, evo: 2 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      const lil = findOnBoard("first", "Lilanthim, Anathema of Predation")!;
      placeEarthSigils(1);
      onEvolve(lil, "first", "normal", { spendPoint: true });
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(0);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("crest at end of opponent's turn: summons and evolves Lilanthim on your board", () => {
      setupTurn(R10, { hand: [LILANTHIM], pp: 7 });
      placeEarthSigils(1);
      whenPlayCard("first", 0);
      const boardBefore = countOnBoardByName(
        "Lilanthim, Anathema of Predation",
      );
      expect(boardBefore).toBe(1);
      whenEndTurn();
      whenEndTurn();
      const onFirst = getBoard(state, "first").filter((c) =>
        c.name?.includes("Lilanthim"),
      );
      expect(onFirst.length).toBe(2);
      const summoned = onFirst.find((c) => c.hasEvolved);
      expect(summoned).toBeDefined();
    });
  });

  describe("Rune Portal (10431310)", () => {
    const printed =
      "Deal 6 damage to all enemy followers. Restore 3 defense to your leader.";

    it("deals 6 to all enemy followers and restores 3 leader HP", () => {
      setupTurn(R10, { hand: [RUNE_PORTAL], pp: 7, hp: 15 });
      const e1 = enemyFollower(2, 6, "E1");
      const e2 = enemyFollower(2, 6, "E2");
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(0);
      expect(Number(e2.defense)).toBe(0);
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Restore 3 defense");
    });
  });

  describe("Beloved Masterpiece (10734120)", () => {
    const printed =
      "Fanfare: Deal 6 damage to all enemy followers.\nWard\nLast Words: Earth Rite (2) - Deal 3 damage to the enemy leader.\nSuper-Evolve: Summon a Beloved Masterpiece.";

    it("Fanfare: deals 6 to all enemy followers", () => {
      setupTurn(R10, { hand: [BELOVED_MASTERPIECE], pp: 9 });
      const e1 = enemyFollower(2, 6, "E1");
      const e2 = enemyFollower(2, 6, "E2");
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(0);
      expect(Number(e2.defense)).toBe(0);
      expect(printed).toContain("Deal 6 damage");
    });

    it("has Ward on field", () => {
      setupTurn(R10, { hand: [BELOVED_MASTERPIECE], pp: 9 });
      whenPlayCard("first", 0);
      const bmp = findOnBoard("first", "Beloved Masterpiece")!;
      expect(hasKeyword(bmp, "Ward")).toBe(true);
    });

    it("Last Words without Earth Rite (2): does not deal 3 to enemy leader", () => {
      setupTurn(R10, { hand: [BELOVED_MASTERPIECE], pp: 9 });
      whenPlayCard("first", 0);
      const bmp = findOnBoard("first", "Beloved Masterpiece")!;
      state.players.second.hp = 20;
      bmp.defense = 0;
      cleanupDead();
      expect(getHP(state, "second")).toBe(20);
      expect(printed).toContain("Earth Rite (2)");
    });

    it("Last Words with Earth Rite (2): deals 3 to enemy leader", () => {
      setupTurn(R10, { hand: [BELOVED_MASTERPIECE], pp: 9 });
      placeEarthSigils(2);
      whenPlayCard("first", 0);
      const bmp = findOnBoard("first", "Beloved Masterpiece")!;
      state.players.second.hp = 20;
      bmp.defense = 0;
      cleanupDead();
      expect(getHP(state, "second")).toBe(17);
    });

    it("Super-Evolve: summons a Beloved Masterpiece copy", () => {
      setupTurn(R10, { hand: [BELOVED_MASTERPIECE], pp: 9, superEvo: 1 });
      whenPlayCard("first", 0);
      const bmp = findOnBoard("first", "Beloved Masterpiece")!;
      onEvolve(bmp, "first", "super", { spendPoint: true });
      expect(countOnBoardByName("Beloved Masterpiece")).toBe(2);
      expect(printed).toContain("Summon a Beloved Masterpiece");
    });
  });

  describe("Blaze Destroyer (10032120)", () => {
    const printed = "On Spellboost: Reduce the cost of this card by 1.";

    it("without spellboost: cost remains 10", () => {
      setupTurn(R10, { hand: [BLAZE_DESTROYER], pp: 10 });
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      expect(getEffectiveCost(blaze, "first")).toBe(10);
    });

    it("after 2 spellboosts: cost reduced by 2", () => {
      setupTurn(R10, { hand: [FORESIGHT, FORESIGHT, BLAZE_DESTROYER], pp: 10 });
      playForesights(2);
      const blaze = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      expect(sbCount(blaze)).toBe(2);
      expect(getEffectiveCost(blaze, "first")).toBe(8);
      expect(printed).toContain("Reduce the cost");
    });
  });

  describe("Calge-Danthla, Eld Crystals (10634120)", () => {
    const printed =
      "Activates in hand. Whenever an allied Crystalspawn enters the field, reduce the cost of this card by 1.\nFanfare: Summon 2 copies of Crystalspawn and give them Storm.\nEvolve: Add a Depths of the Eld Crystals to your hand.";

    it("in hand: Crystalspawn enter reduces cost by 1", () => {
      setupTurn(R10, { hand: [CALGE_DANTHLA, CRYSTALSPAWN], pp: 10 });
      crestAddCounter("first", CALGE_FAITH, "faith", 0);
      const calge = thenHand("first").find((c) => c.id === CALGE_DANTHLA)!;
      const cost0 = getEffectiveCost(calge, "first");
      whenPlayCard("first", 1);
      const cost1 = getEffectiveCost(
        thenHand("first").find((c) => c.id === CALGE_DANTHLA)!,
        "first",
      );
      expect(cost1).toBe(cost0 - 1);
      expect(printed).toContain("reduce the cost");
    });

    it("Fanfare: summons 2 Storm Crystalspawn", () => {
      setupTurn(R10, { hand: [CALGE_DANTHLA], pp: 10 });
      whenPlayCard("first", 0);
      const cs = thenBoard("first").filter((c) => c.id === CRYSTALSPAWN);
      expect(cs).toHaveLength(2);
      expect(cs.every((c) => hasKeyword(c, "Storm"))).toBe(true);
      expect(printed).toContain("Storm");
    });

    it("Evolve: adds Depths of the Eld Crystals (90034330) to hand", () => {
      setupTurn(R10, { hand: [CALGE_DANTHLA], pp: 10, evo: 2 });
      whenPlayCard("first", 0);
      const calge = findOnBoard("first", "Calge-Danthla, Eld Crystals")!;
      onEvolve(calge, "first", "normal", { spendPoint: true });
      expect(handIds()).toContain(DEPTHS_ELD_CRYSTALS);
      expect(printed).toContain("Depths of the Eld Crystals");
    });

    it("faith counter increases when Crystalspawn enters (faith package)", () => {
      setupTurn(R10, {
        hand: [CRYSTALSPAWN],
        pp: 1,
        deck: [CALGE_DANTHLA, ...Array(9).fill(FILLER)],
      });
      setupCalgeFaith();
      whenPlayCard("first", 0);
      const faithCrest = getCrests(state, "first").find(
        (c) => c.name === CALGE_FAITH,
      );
      expect(faithCrest?.counters?.faith ?? 0).toBe(1);
      expect(printed).toContain("Crystalspawn");
    });
  });
});
