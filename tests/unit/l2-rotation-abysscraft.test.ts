/**
 * L2 real-card tests — Rotation Abysscraft deck (44 cards).
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
  createCard,
  resetUidCounter,
  thenHand,
  thenDeck,
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
import { isCantAttackLocked } from "../../src/logic/core/keywords/has.js";
import {
  tickCrests,
  playerHasCrestPassive,
} from "../../src/logic/effects/crest.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { summonFollowerByCardId } from "../harness/l2Dispatch.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  runEndOfTurnBoundary,
  runStartOfTurnBoundary,
} from "../../src/logic/core/turnBoundary.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
  getShadows,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const SOUL_TUNING = "10751310";
const ALMEIDA = "10451110";
const CHAINS = "10952310";
const CHAOS_CYCLONE = "10051310";
const LULUMI = "10751110";
const REAPERS_DUE = "10953310";
const ARRIET = "10002110";
const SUPPLICANT_OF_UNKILLING = "10312110";
const CONGREGANT_OF_UNKILLING = "10313110";
const RIGOR = "10553310";
const SOUL_PREDATION = "10052310";
const SUPPORT_WOLF = "10551110";
const VALIANT_EDGE = "10451310";
const VALOR = "10551310";
const ADVENT_ELD_SIGHT = "10651310";
const BITTERSWEET = "10852310";
const DEPLETIVE_ELD_SIGHT = "10653310";
const GHOST_DODGER = "10651120";
const NIGHT_FIEND = "10051120";
const SATYR = "10452120";
const YEARNFUL = "10652110";
const AMOROUS = "10052120";
const CRIMSON_SOULMANCER = "10551120";
const DEVILISH_HEARTBREAKER = "10652120";
const SPOOKY_SURPRISE = "10951310";
const CERES = "10854120";
const CORRUPTION = "10453310";
const DEPRIVED_DESTROYER = "10653110";
const FRIENDLY_BLUE_OGRE = "10552120";
const MARSHA = "10852120";
const FIOLE = "10852110";
const JUGGLER_CORVID = "10752120";
const MILTEO = "10554110";
const MISTRESS = "10051110";
const NEHAN = "10453110";
const NEZHA = "10452110";
const VASERAGA = "10451120";
const ALLURE = "10652310";
const BEASTMASTER_BONES = "10753110";
const BELIAL = "10454120";
const FEDIEL = "10454110";
const HARMONY = "10752310";
const ISTYNDET = "10954110";
const SPARKLY_DEMONESS = "10952120";
const ARMES = "10654110";
const LIFESTEALER = "10553110";
const SHAKDOH = "10554120";

// Tokens
const BAT = "90051120";
const SKELETON = "90051110";
const GHOST = "90051130";
const ROTTING_ZOMBIE = "90051140";

// Filler / test helpers
const FILLER = "10151110";
const DRAW_TOP = "10051120";
const DRAW_SECOND = "10051110";
const REANIMATE_CORPSE = "10151120";
const REANIMATE_CORPSE_4 = "10451110";
const REANIMATE_CORPSE_1 = "10052110";
const ABYSS_HAND = "10051310";
const SAME_COST_A = "10051120";
const SAME_COST_B = "10051120";
const SAME_COST_C = "10051120";
const SAME_COST_D = "10051120";
const MIXED_COST_1 = "10751310"; // Soul Tuning, cost 1
const MIXED_COST_2 = "10051310"; // Chaos Cyclone, cost 2
const MIXED_COST_3 = "10051120"; // Night Fiend, cost 3
const MIXED_COST_6 = "10051110"; // Mistress of the Fanged, cost 6

const R3 = 3;
const R4 = 4;
const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | { name: string; type: string; cost?: number }>;
    pp?: number;
    evo?: number;
    hp?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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
  name = "Ally",
  atk = 2,
  def = 2,
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

function hasLastWords(card: ReturnType<typeof createCard>): boolean {
  if (card.hasLastWords) return true;
  if (Array.isArray(card.keywords)) {
    return card.keywords.some(
      (k) =>
        k === "LastWords" ||
        (typeof k === "object" &&
          k !== null &&
          (k as { name?: string }).name === "LastWords"),
    );
  }
  return false;
}

function enemyLastWordsFollower(name = "LWEnemy") {
  const lw = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  lw.peak_defense = 3;
  lw.hasLastWords = true;
  lw.lastWordsEffects = [
    { op: "summon", source: "named", name: "Skeleton", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
}

function putCorpseInGraveyard(id: string, owner: "first" | "second" = "first") {
  const c = createCard(id, "board", owner);
  c.peak_defense = Number(c.defense) || 1;
  state.players[owner].board.push(c);
  c.defense = 0;
  cleanupDead();
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function boardNames(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => c.name);
}

function findCrest(owner: "first" | "second", fragment: string) {
  return getCrests(state, owner).find((c) => c.name.includes(fragment));
}

function isInEitherGraveyard(uid: string): boolean {
  return (
    getGraveyard(state, "first").some((c) => c.uid === uid) ||
    getGraveyard(state, "second").some((c) => c.uid === uid)
  );
}

describe("L2 — Rotation Abysscraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Soul Tuning (10751310)", () => {
    const printed =
      "Select 2 allied followers on the field and give them +0/+1. Draw a card.";

    it("selects 2 allies +0/+1 and draws a stacked deck card", () => {
      setupTurn(R5, {
        hand: [SOUL_TUNING],
        deck: [FILLER, DRAW_TOP],
        pp: 1,
      });
      const allyA = allyFollower("AllyA", 2, 2);
      const allyB = allyFollower("AllyB", 3, 3);
      const bystander = allyFollower("Bystander", 1, 1);
      whenPlayCard("first", 0);
      resolvePendingByUid(allyA.uid);
      resolvePendingByUid(allyB.uid);
      expect(Number(allyA.defense)).toBe(3);
      expect(Number(allyB.defense)).toBe(4);
      expect(Number(allyA.attack)).toBe(2);
      expect(Number(allyB.attack)).toBe(3);
      expect(Number(bystander.defense)).toBe(1);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });
  });

  describe("Almeida, Headstrong Miner (10451110)", () => {
    const printed = "Enhance(4): Evolve this follower and give it +1/+1.\nRush";

    it("enters with Rush without Enhance", () => {
      setupTurn(R5, { hand: [ALMEIDA], pp: 2 });
      whenPlayCard("first", 0);
      const almeida = findOnBoard("first", "Almeida, Headstrong Miner")!;
      expect(almeida.hasRush).toBe(true);
      expect(almeida.hasEvolved).toBeFalsy();
      expect(Number(almeida.attack)).toBe(3);
      expect(Number(almeida.defense)).toBe(1);
      expect(printed).toContain("Rush");
    });

    it("Enhance(4): evolves and gains +1/+1", () => {
      setupTurn(R5, { hand: [ALMEIDA], pp: 4 });
      whenPlayCard("first", 0);
      const almeida = findOnBoard("first", "Almeida, Headstrong Miner")!;
      expect(almeida.hasEvolved).toBe(true);
      expect(Number(almeida.attack)).toBe(6);
      expect(Number(almeida.defense)).toBe(4);
      expect(printed).toContain("Enhance(4)");
    });

    it("without Enhance(4): plays at base stats without evolving", () => {
      setupTurn(R5, { hand: [ALMEIDA], pp: 2 });
      whenPlayCard("first", 0);
      const almeida = findOnBoard("first", "Almeida, Headstrong Miner")!;
      expect(almeida.hasEvolved).toBeFalsy();
      expect(Number(almeida.attack)).toBe(3);
      expect(Number(almeida.defense)).toBe(1);
    });
  });

  describe("Chains of the Past (10952310)", () => {
    const printed =
      'Do this 1 time: "Deal 3 damage to a random enemy follower. Deal 1 damage to both leaders."\nEnhance (4): Do it 2 times instead.';

    it("base: 3 to random enemy follower and 1 to both leaders", () => {
      setupTurn(R5, { hand: [CHAINS], pp: 2 });
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(19);
      expect(getHP(state, "second")).toBe(19);
      expect(printed).toContain("both leaders");
    });

    it("Enhance (4): repeats the sequence twice", () => {
      setupTurn(R5, { hand: [CHAINS], pp: 4 });
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(4);
      expect(getHP(state, "first")).toBe(18);
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Do it 2 times instead");
    });
  });

  describe("Chaos Cyclone (10051310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Draw a follower.\n2. Reanimate (2).";

    it("Mode 1: draws a follower from stacked deck", () => {
      setupTurn(R5, {
        hand: [CHAOS_CYCLONE],
        deck: [FILLER, REANIMATE_CORPSE],
        pp: 2,
      });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(REANIMATE_CORPSE);
      expect(printed).toContain("Draw a follower");
    });

    it("Mode 2: Reanimate (2) summons from graveyard", () => {
      setupTurn(R5, { hand: [CHAOS_CYCLONE], pp: 2 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE)).toBe(
        true,
      );
      expect(printed).toContain("Reanimate (2)");
    });
  });

  describe("Lulumi, Vamp on the Keys (10751110)", () => {
    const printed = "Rush\nLast Words: Add a Bat to your hand.";

    it("enters with Rush", () => {
      setupTurn(R5, { hand: [LULUMI], pp: 2 });
      whenPlayCard("first", 0);
      const lulumi = findOnBoard("first", "Lulumi, Vamp on the Keys")!;
      expect(lulumi.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Last Words adds Bat (90051120) to hand", () => {
      setupTurn(R5, { hand: [LULUMI], pp: 2 });
      whenPlayCard("first", 0);
      const lulumi = findOnBoard("first", "Lulumi, Vamp on the Keys")!;
      applyKeywordsFromList(lulumi);
      lulumi.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(BAT);
      expect(printed).toContain("Add a Bat");
    });
  });

  describe("Reaper's Due (10953310)", () => {
    const printed =
      'Select an allied follower on the field and give it "Last Words: Summon a copy of this card."';

    it("grants Last Words summon copy to selected ally; bystander untouched", () => {
      setupTurn(R6, { hand: [REAPERS_DUE], pp: 4 });
      const target = createCard(ARRIET, "board", "first");
      target.peak_defense = Number(target.defense);
      state.players.first.board.push(target);
      const bystander = allyFollower("Bystander", 2, 2);
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const boardBefore = thenBoard("first").length;
      target.defense = 0;
      cleanupDead();
      expect(thenBoard("first").length).toBe(boardBefore);
      expect(thenBoard("first").some((c) => c.id === ARRIET)).toBe(true);
      expect(Number(bystander.defense)).toBe(2);
      expect(printed).toContain("Summon a copy");
    });

    it("granted Last Words on buffed/debuffed follower summons printed copy — no LW, printed stats", () => {
      setupTurn(R6, { hand: [REAPERS_DUE], pp: 4 });
      const arriet = createCard(ARRIET, "board", "first");
      arriet.peak_defense = Number(arriet.defense);
      state.players.first.board.push(arriet);
      whenPlayCard("first", 0);
      resolvePendingByUid(arriet.uid);
      expect(hasLastWords(arriet)).toBe(true);
      arriet.attack = Number(arriet.attack) + 1;
      arriet.defense = Number(arriet.defense) + 1;
      arriet.defense = Number(arriet.defense) - 3;
      const originalUid = arriet.uid;
      arriet.defense = 0;
      cleanupDead();
      const copies = thenBoard("first").filter((c) => c.id === ARRIET);
      expect(copies).toHaveLength(1);
      const copy = copies[0]!;
      expect(copy.uid).not.toBe(originalUid);
      expect(Number(copy.attack)).toBe(3);
      expect(Number(copy.defense)).toBe(3);
      expect(Number(copy.cost)).toBe(3);
      expect(hasLastWords(copy)).toBe(false);
      expect(copy.buffs ?? {}).toEqual({});
      const countBefore = thenBoard("first").length;
      copy.defense = 0;
      cleanupDead();
      expect(thenBoard("first").length).toBe(countBefore - 1);
      expect(thenBoard("first").some((c) => c.id === ARRIET)).toBe(false);
      expect(printed).toContain("Summon a copy of this card");
    });

    it("Arriet + Supplicant soak shape — one printed Arriet remains, game continues", () => {
      setupTurn(R10, {
        hand: [REAPERS_DUE, SUPPLICANT_OF_UNKILLING],
        pp: 10,
      });
      const arriet = createCard(ARRIET, "board", "first");
      arriet.peak_defense = Number(arriet.defense);
      state.players.first.board.push(arriet);
      whenPlayCard("first", 0);
      resolvePendingByUid(arriet.uid);
      whenPlayCard("first", 0);
      arriet.attack = Number(arriet.attack);
      arriet.defense = Math.max(0, Number(arriet.defense) - 3);
      const originalUid = arriet.uid;
      arriet.defense = 0;
      cleanupDead();
      const arriets = thenBoard("first").filter((c) => c.id === ARRIET);
      expect(arriets).toHaveLength(1);
      const copy = arriets[0]!;
      expect(copy.uid).not.toBe(originalUid);
      expect(Number(copy.attack)).toBe(3);
      expect(Number(copy.defense)).toBe(3);
      expect(hasLastWords(copy)).toBe(false);
      copy.defense = 0;
      cleanupDead();
      expect(thenBoard("first").filter((c) => c.id === ARRIET)).toHaveLength(0);
      expect(state.gameOver).toBeFalsy();
    });
  });

  describe("Congregant of Unkilling (10313110)", () => {
    const printed =
      "When this card enters the field, summon an exact copy of it and give the exact copy -0/-1.\nRush\nWard";

    it("exact copy keeps -0/-1 and source current stats (buffed source)", () => {
      setupTurn(R10, { hand: [CONGREGANT_OF_UNKILLING], pp: 9 });
      for (let i = 0; i < 3; i++) {
        allyFollower(`Ally${i}`, 1, 1);
      }
      const inHand = getHand(state, "first").find(
        (c) => c.id === CONGREGANT_OF_UNKILLING,
      )!;
      inHand.attack = 5;
      inHand.defense = 7;
      whenPlayCard("first", 0);
      const copies = thenBoard("first")
        .filter((c) => c.id === CONGREGANT_OF_UNKILLING)
        .map((c) => ({
          atk: Number(c.attack),
          def: Number(c.defense),
        }))
        .sort((a, b) => b.def - a.def);
      expect(copies).toEqual([
        { atk: 5, def: 7 },
        { atk: 5, def: 6 },
      ]);
      expect(printed).toContain("exact copy");
    });
  });

  describe("Rigor of the Nightblossom (10553310)", () => {
    const printed = "Gain Crest: Rigor of the Nightblossom.";
    const crestPrinted =
      "Countdown (2)\nAt the end of your turn, draw a card. Then, if you have at least 4 cards with the same cost in your hand, summon a Skeleton and give it Ward.";

    it("play gains Crest: Rigor with Countdown (2)", () => {
      setupTurn(R5, { hand: [RIGOR], pp: 2 });
      whenPlayCard("first", 0);
      const crest = findCrest("first", "Rigor")!;
      expect(crest).toBeTruthy();
      expect(Number(crest.countdown)).toBe(2);
      expect(printed).toContain("Gain Crest");
    });

    it("owner's EOT: draws a card", () => {
      setupTurn(R5, {
        hand: [RIGOR],
        deck: [FILLER, DRAW_TOP],
        pp: 2,
      });
      whenPlayCard("first", 0);
      const handBefore = handIds().length;
      runEndOfTurnBoundary("first");
      expect(handIds().length).toBe(handBefore + 1);
      expect(crestPrinted).toContain("draw a card");
    });

    it("owner's EOT with 4 same-cost cards: summons Ward Skeleton", () => {
      setupTurn(R5, {
        hand: [RIGOR, SAME_COST_A, SAME_COST_B, SAME_COST_C, SAME_COST_D],
        deck: [SAME_COST_A, SAME_COST_B],
        pp: 2,
      });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      const skel = thenBoard("first").find((c) => c.id === SKELETON);
      expect(skel).toBeTruthy();
      expect(skel!.hasWard).toBe(true);
      expect(crestPrinted).toContain("4 cards with the same cost");
    });

    it("owner's EOT with fewer than 4 same-cost cards: no Skeleton summon", () => {
      setupTurn(R5, {
        hand: [RIGOR, SAME_COST_A, SAME_COST_B, SAME_COST_C],
        pp: 2,
      });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(thenBoard("first").some((c) => c.id === SKELETON)).toBe(false);
    });

    it("opponent's EOT: crest does not draw or summon", () => {
      setupTurn(R5, {
        hand: [RIGOR, SAME_COST_A, SAME_COST_B, SAME_COST_C, SAME_COST_D],
        pp: 2,
        active: "second",
      });
      whenPlayCard("first", 0);
      const handBefore = handIds().length;
      const boardBefore = thenBoard("first").length;
      runEndOfTurnBoundary("second");
      expect(handIds().length).toBe(handBefore);
      expect(thenBoard("first").length).toBe(boardBefore);
    });

    it("owner SOT: Countdown (2) expires after two ticks", () => {
      setupTurn(R5, { hand: [RIGOR], pp: 2 });
      whenPlayCard("first", 0);
      expect(findCrest("first", "Rigor")).toBeTruthy();
      runStartOfTurnBoundary("first", { tickCrests });
      expect(Number(findCrest("first", "Rigor")!.countdown)).toBe(1);
      runStartOfTurnBoundary("first", { tickCrests });
      expect(findCrest("first", "Rigor")).toBeUndefined();
    });
  });

  describe("Soul Predation (10052310)", () => {
    const printed =
      "Select an allied follower on the field and destroy it. Draw 2 cards.";

    it("destroys selected ally and draws 2 stacked cards; bystander untouched", () => {
      setupTurn(R5, {
        hand: [SOUL_PREDATION],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 2,
      });
      const target = allyFollower("Sacrifice", 2, 2);
      const bystander = allyFollower("Bystander", 2, 2);
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "first").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getBoard(state, "first").some((c) => c.uid === bystander.uid),
      ).toBe(true);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Support Wolf (10551110)", () => {
    const printed =
      "Enhance (6): Give this follower +0/+6, Bane, and Barrier.\nRush";

    it("enters with Rush without Enhance", () => {
      setupTurn(R5, { hand: [SUPPORT_WOLF], pp: 2 });
      whenPlayCard("first", 0);
      const wolf = findOnBoard("first", "Support Wolf")!;
      expect(wolf.hasRush).toBe(true);
      expect(Number(wolf.defense)).toBe(2);
      expect(wolf.hasBane).toBeFalsy();
      expect(printed).toContain("Rush");
    });

    it("Enhance (6): +0/+6, Bane, and Barrier", () => {
      setupTurn(R8, { hand: [SUPPORT_WOLF], pp: 6 });
      whenPlayCard("first", 0);
      const wolf = findOnBoard("first", "Support Wolf")!;
      expect(Number(wolf.defense)).toBe(8);
      expect(wolf.hasBane).toBe(true);
      expect(wolf.hasBarrier).toBe(true);
      expect(printed).toContain("Enhance (6)");
    });

    it("without Enhance (6): no Bane or Barrier buff", () => {
      setupTurn(R5, { hand: [SUPPORT_WOLF], pp: 2 });
      whenPlayCard("first", 0);
      const wolf = findOnBoard("first", "Support Wolf")!;
      expect(Number(wolf.defense)).toBe(2);
      expect(wolf.hasBane).toBeFalsy();
      expect(wolf.hasBarrier).toBeFalsy();
    });
  });

  describe("Valiant Edge (10451310)", () => {
    const printed = "Deal 2 damage to your leader. Gain Crest: Valiant Edge.";
    const crestPrinted =
      "Countdown (2). At the end of your turn, deal 2 damage to a random enemy follower and restore 1 defense to your leader.";

    it("play deals 2 to your leader and gains crest", () => {
      setupTurn(R5, { hand: [VALIANT_EDGE], pp: 2 });
      state.players.first.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(18);
      expect(findCrest("first", "Valiant Edge")).toBeTruthy();
      expect(printed).toContain("Gain Crest");
    });

    it("owner's EOT: 2 random enemy follower damage and restore 1 leader HP", () => {
      setupTurn(R5, { hand: [VALIANT_EDGE], pp: 2 });
      state.players.first.hp = 20;
      enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(18);
      runEndOfTurnBoundary("first");
      expect(Number(getBoard(state, "second")[0]!.defense)).toBe(3);
      expect(getHP(state, "first")).toBe(19);
      expect(crestPrinted).toContain("restore 1 defense");
    });

    it("opponent's EOT: crest does not trigger", () => {
      setupTurn(R5, { hand: [VALIANT_EDGE], pp: 2, active: "second" });
      state.players.first.hp = 18;
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(5);
      expect(getHP(state, "first")).toBe(18);
    });

    it("owner SOT: Countdown (2) expires after two ticks", () => {
      setupTurn(R5, { hand: [VALIANT_EDGE], pp: 2 });
      whenPlayCard("first", 0);
      runStartOfTurnBoundary("first", { tickCrests });
      expect(Number(findCrest("first", "Valiant Edge")!.countdown)).toBe(1);
      runStartOfTurnBoundary("first", { tickCrests });
      expect(findCrest("first", "Valiant Edge")).toBeUndefined();
    });
  });

  describe("Valor of the Nightblossom (10551310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 5 damage. Add a Valor of the Nightblossom to your deck.";

    it("deals 5 to selected enemy and adds copy to deck; bystander untouched", () => {
      setupTurn(R5, { hand: [VALOR], pp: 2 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(1);
      expect(Number(bystander.defense)).toBe(6);
      expect(deckIds()).toContain(VALOR);
      expect(printed).toContain("Add a Valor");
    });
  });

  describe("Advent of the Eld Sight (10651310)", () => {
    const printed =
      "Draw 2 cards. Necromancy (4) - Restore 2 defense to your leader.";

    it("with Necromancy (4): draws 2 and restores 2 leader HP", () => {
      setupTurn(R5, {
        hand: [ADVENT_ELD_SIGHT],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 3,
      });
      state.players.first.hp = 15;
      state.players.first.shadows = 4;
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("Necromancy (4)");
    });

    it("without Necromancy (4): draws 2 but does not restore leader", () => {
      setupTurn(R5, {
        hand: [ADVENT_ELD_SIGHT],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 3,
      });
      state.players.first.hp = 15;
      state.players.first.shadows = 2;
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(15);
    });
  });

  describe("Bittersweet Departures (10852310)", () => {
    const printed =
      "Select 2 Modes to activate.\n1. Deal 1 damage to the enemy leader.\n2. Restore 2 defense to your leader.\n3. Deal 3 damage to a random enemy follower.\n4. Gain 4 shadows.";

    it("modes 1+2: 1 enemy leader damage and restore 2 to your leader", () => {
      setupTurn(R5, { hand: [BITTERSWEET], pp: 3, hp: 15 });
      state.players.second.hp = 20;
      setScriptedModePickProvider(() => [0, 1]);
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(19);
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("Restore 2 defense");
    });

    it("modes 3+4: 3 random enemy follower damage and gain 4 shadows", () => {
      setupTurn(R5, { hand: [BITTERSWEET], pp: 3 });
      state.players.first.shadows = 0;
      const foe = enemyFollower(2, 5, "Foe");
      setScriptedModePickProvider(() => [2, 3]);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(2);
      expect(getShadows(state, "first")).toBe(5);
      expect(printed).toContain("Gain 4 shadows");
    });
  });

  describe("Depletive Eld Sight (10653310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Recover 1 evolution point.\n2. Deal 2 damage to all enemy followers.";

    it("Mode 1: recovers 1 evolution point", () => {
      setupTurn(R6, { hand: [DEPLETIVE_ELD_SIGHT], pp: 3, evo: 1 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(state.players.first.evoCharges).toBe(2);
      expect(printed).toContain("Recover 1 evolution point");
    });

    it("Mode 2: deals 2 damage to all enemy followers", () => {
      setupTurn(R6, { hand: [DEPLETIVE_ELD_SIGHT], pp: 3 });
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(printed).toContain("Deal 2 damage to all enemy followers");
    });
  });

  describe("Ghost Dodger (10651120)", () => {
    const printed = "Rush\nLast Words: Add a Ghost to your hand.";

    it("enters with Rush", () => {
      setupTurn(R5, { hand: [GHOST_DODGER], pp: 3 });
      whenPlayCard("first", 0);
      const dodger = findOnBoard("first", "Ghost Dodger")!;
      expect(dodger.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Last Words adds Ghost (90051130) to hand", () => {
      setupTurn(R5, { hand: [GHOST_DODGER], pp: 3 });
      whenPlayCard("first", 0);
      const dodger = findOnBoard("first", "Ghost Dodger")!;
      applyKeywordsFromList(dodger);
      dodger.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(GHOST);
      expect(printed).toContain("Add a Ghost");
    });
  });

  describe("Night Fiend (10051120)", () => {
    const printed = "Fanfare: Deal 1 damage to your leader.";

    it("Fanfare deals 1 damage to your leader", () => {
      setupTurn(R5, { hand: [NIGHT_FIEND], pp: 3 });
      state.players.first.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("Deal 1 damage to your leader");
    });
  });

  describe("Satyr, Open-Hearted Rover (10452120)", () => {
    const printed =
      "Fanfare: If there's an evolved allied follower on the field, evolve this follower.\nAura";

    it("with evolved ally: Fanfare evolves Satyr", () => {
      setupTurn(R5, { hand: [SATYR], pp: 3 });
      const evolved = allyFollower("EvoAlly", 2, 2);
      evolved.hasEvolved = true;
      whenPlayCard("first", 0);
      const satyr = findOnBoard("first", "Satyr, Open-Hearted Rover")!;
      expect(satyr.hasEvolved).toBe(true);
      expect(printed).toContain("evolve this follower");
    });

    it("without evolved ally: Fanfare does not evolve Satyr", () => {
      setupTurn(R5, { hand: [SATYR], pp: 3 });
      allyFollower("RawAlly", 2, 2);
      whenPlayCard("first", 0);
      const satyr = findOnBoard("first", "Satyr, Open-Hearted Rover")!;
      expect(satyr.hasEvolved).toBeFalsy();
    });

    it("has Aura keyword on board", () => {
      setupTurn(R5, { hand: [SATYR], pp: 3 });
      whenPlayCard("first", 0);
      const satyr = findOnBoard("first", "Satyr, Open-Hearted Rover")!;
      expect(satyr.hasAura || satyr.keywords?.includes("Aura")).toBe(true);
      expect(printed).toContain("Aura");
    });
  });

  describe("Yearnful Necromancer (10652110)", () => {
    const printed = "Enhance (8): Reanimate (9).\nWard";

    it("enters with Ward without Enhance", () => {
      setupTurn(R8, { hand: [YEARNFUL], pp: 3 });
      whenPlayCard("first", 0);
      const yearn = findOnBoard("first", "Yearnful Necromancer")!;
      expect(yearn.hasWard).toBe(true);
      expect(thenBoard("first").length).toBe(1);
      expect(printed).toContain("Ward");
    });

    it("Enhance (8): Reanimate (9) from graveyard", () => {
      setupTurn(R10, { hand: [YEARNFUL], pp: 8 });
      const corpse = createCard(
        { name: "BigCorpse", type: "Follower", cost: 9, attack: 5, defense: 5 },
        "board",
        "first",
      );
      corpse.peak_defense = 5;
      state.players.first.board.push(corpse);
      recordDestroyed(state, "first", corpse);
      cleanupDead();
      whenPlayCard("first", 0);
      expect(thenBoard("first").some((c) => c.name === "BigCorpse")).toBe(true);
      expect(printed).toContain("Reanimate (9)");
    });

    it("without Enhance (8): does not reanimate", () => {
      setupTurn(R8, { hand: [YEARNFUL], pp: 3 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      whenPlayCard("first", 0);
      expect(thenBoard("first").length).toBe(1);
    });
  });

  describe("Amorous Necromancer (10052120)", () => {
    const printed =
      "Evolve: Summon 2 copies of Ghost.\nSuper-Evolve: Give them Drain.";

    it("Evolve summons 2 Ghosts (90051130)", () => {
      setupTurn(R6, { hand: [AMOROUS], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const amorous = findOnBoard("first", "Amorous Necromancer")!;
      whenEvolve(amorous, "first");
      expect(thenBoard("first").filter((c) => c.id === GHOST).length).toBe(2);
      expect(printed).toContain("Summon 2 copies of Ghost");
    });

    it("Super-Evolve gives summoned Ghosts Drain", () => {
      setupTurn(R6, { hand: [AMOROUS], pp: 4 });
      whenPlayCard("first", 0);
      const amorous = findOnBoard("first", "Amorous Necromancer")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(amorous, "first");
      const ghosts = thenBoard("first").filter((c) => c.id === GHOST);
      expect(ghosts.length).toBe(2);
      expect(
        ghosts.every((g) => g.hasDrain || g.keywords?.includes("Drain")),
      ).toBe(true);
      expect(printed).toContain("Give them Drain");
    });
  });

  describe("Crimson Soulmancer (10551120)", () => {
    const printed =
      "Fanfare: Reanimate (2).\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare Reanimate (2) from graveyard", () => {
      setupTurn(R6, { hand: [CRIMSON_SOULMANCER], pp: 4 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      whenPlayCard("first", 0);
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE)).toBe(
        true,
      );
      expect(printed).toContain("Reanimate (2)");
    });

    it("Evolve replicates Fanfare Reanimate (2)", () => {
      setupTurn(R6, { hand: [CRIMSON_SOULMANCER], pp: 4, evo: 2 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      whenPlayCard("first", 0);
      const soul = findOnBoard("first", "Crimson Soulmancer")!;
      const boardBefore = thenBoard("first").length;
      whenEvolve(soul, "first");
      expect(thenBoard("first").length).toBe(boardBefore + 1);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Devilish Heartbreaker (10652120)", () => {
    const printed =
      "Enhance (7): Give this follower Storm.\nEvolve: Select an enemy follower on the field and deal it 4 damage.";

    it("Enhance (7): gains Storm", () => {
      setupTurn(R8, { hand: [DEVILISH_HEARTBREAKER], pp: 7 });
      whenPlayCard("first", 0);
      const hb = findOnBoard("first", "Devilish Heartbreaker")!;
      expect(hb.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });

    it("without Enhance (7): no Storm", () => {
      setupTurn(R6, { hand: [DEVILISH_HEARTBREAKER], pp: 4 });
      whenPlayCard("first", 0);
      const hb = findOnBoard("first", "Devilish Heartbreaker")!;
      expect(hb.hasStorm).toBeFalsy();
    });

    it("Evolve deals 4 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [DEVILISH_HEARTBREAKER], pp: 4, evo: 2 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      const hb = findOnBoard("first", "Devilish Heartbreaker")!;
      whenEvolve(hb, "first");
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(6);
      expect(printed).toContain("deal it 4 damage");
    });
  });

  describe("Spooky Surprise (10951310)", () => {
    const printed = "Summon a Ghost and Rotting Zombie.";

    it("summons Ghost (90051130) and Rotting Zombie (90051140)", () => {
      setupTurn(R6, { hand: [SPOOKY_SURPRISE], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardIds("first")).toContain(GHOST);
      expect(boardIds("first")).toContain(ROTTING_ZOMBIE);
      expect(printed).toContain("Ghost and Rotting Zombie");
    });
  });

  describe("Ceres, Liminal Rose (10854120)", () => {
    const printed =
      "Fanfare: Necromancy (20) - Reduce the cost of all Abysscraft cards in your hand by 2.\nClash: Deal 4 damage to the opposing follower.\nAt the end of your turn, restore 4 defense to your leader.";

    it("with Necromancy (20): reduces Abysscraft hand card costs by 2", () => {
      setupTurn(R10, { hand: [CERES, ABYSS_HAND], pp: 5 });
      state.players.first.shadows = 20;
      const abyss = getHand(state, "first").find((c) => c.id === ABYSS_HAND)!;
      const costBefore = getEffectiveCost(abyss);
      whenPlayCard("first", 0);
      expect(getEffectiveCost(abyss)).toBe(costBefore - 2);
      expect(printed).toContain("Necromancy (20)");
    });

    it("without Necromancy (20): hand costs unchanged", () => {
      setupTurn(R10, { hand: [CERES, ABYSS_HAND], pp: 5 });
      state.players.first.shadows = 19;
      const abyss = getHand(state, "first").find((c) => c.id === ABYSS_HAND)!;
      const costBefore = getEffectiveCost(abyss);
      whenPlayCard("first", 0);
      expect(getEffectiveCost(abyss)).toBe(costBefore);
    });

    it("Clash deals 4 damage to opposing follower", () => {
      setupTurn(R10, { hand: [CERES], pp: 5 });
      whenPlayCard("first", 0);
      const ceres = findOnBoard("first", "Ceres, Liminal Rose")!;
      applyKeywordsFromList(ceres);
      ceres.can_attack = true;
      ceres.can_attack_followers = true;
      ceres.attacks_left = 1;
      ceres.justPlayed = false;
      const foe = enemyFollower(2, 10, "ClashFoe");
      attackFollower(0, 0, "first", "second");
      expect(Number(foe.defense)).toBe(5);
      expect(printed).toContain("Deal 4 damage to the opposing follower");
    });

    it("owner's EOT restores 4 defense to your leader", () => {
      setupTurn(R10, { hand: [CERES], pp: 5, hp: 12 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("restore 4 defense");
    });

    it("opponent's EOT: does not restore your leader", () => {
      setupTurn(R10, { hand: [CERES], pp: 5, hp: 12, active: "second" });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(12);
    });
  });

  describe("Corruption (10453310)", () => {
    const printed =
      "Give all followers on the field -2/-2. Give yourself and your opponent Crest: Corruption.\nSuper Skybound Art- Destroy your Crest: Corruption.";
    const crestPrinted =
      "Countdown (4). At the end of your turn, deal 2 damage to your leader.";

    it("gives all followers -2/-2 and both players gain crest", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5 });
      const ally = allyFollower("Ally", 4, 4);
      const foe = enemyFollower(4, 4, "Foe");
      whenPlayCard("first", 0);
      expect(Number(ally.attack)).toBe(2);
      expect(Number(ally.defense)).toBe(2);
      expect(Number(foe.attack)).toBe(2);
      expect(Number(foe.defense)).toBe(2);
      expect(findCrest("first", "Corruption")).toBeTruthy();
      expect(findCrest("second", "Corruption")).toBeTruthy();
      expect(printed).toContain("-2/-2");
    });

    it("owner's EOT: crest deals 2 damage to your leader", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5 });
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(getHP(state, "first")).toBe(18);
      expect(getHP(state, "second")).toBe(20);
      expect(crestPrinted).toContain("deal 2 damage to your leader");
    });

    it("second player's EOT: their crest deals 2 to second leader only", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5 });
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(20);
      expect(getHP(state, "second")).toBe(18);
      expect(crestPrinted).toContain("deal 2 damage to your leader");
    });

    it("opponent's EOT: your crest does not damage your leader", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5, active: "second" });
      state.players.first.hp = 20;
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(20);
    });

    it("each crest ticks countdown only on its owner's SOT", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5 });
      whenPlayCard("first", 0);
      const firstCd = Number(findCrest("first", "Corruption")!.countdown);
      const secondCd = Number(findCrest("second", "Corruption")!.countdown);
      expect(firstCd).toBe(4);
      expect(secondCd).toBe(4);
      runStartOfTurnBoundary("second", { tickCrests });
      expect(Number(findCrest("first", "Corruption")!.countdown)).toBe(4);
      expect(Number(findCrest("second", "Corruption")!.countdown)).toBe(3);
      runStartOfTurnBoundary("first", { tickCrests });
      expect(Number(findCrest("first", "Corruption")!.countdown)).toBe(3);
      expect(Number(findCrest("second", "Corruption")!.countdown)).toBe(3);
      expect(crestPrinted).toContain("Countdown (4)");
    });

    it("each crest expires after four of its owner's SOT ticks", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5 });
      whenPlayCard("first", 0);
      for (let i = 0; i < 4; i++) {
        runStartOfTurnBoundary("first", { tickCrests });
      }
      expect(findCrest("first", "Corruption")).toBeUndefined();
      expect(findCrest("second", "Corruption")).toBeTruthy();
      expect(Number(findCrest("second", "Corruption")!.countdown)).toBe(4);
      for (let i = 0; i < 4; i++) {
        runStartOfTurnBoundary("second", { tickCrests });
      }
      expect(findCrest("second", "Corruption")).toBeUndefined();
    });

    it("Super Skybound Art: destroys your Crest: Corruption", () => {
      setupTurn(R10, { hand: [CORRUPTION], pp: 5 });
      const spell = getHand(state, "first").find((c) => c.id === CORRUPTION)!;
      spell.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      expect(findCrest("first", "Corruption")).toBeUndefined();
      expect(findCrest("second", "Corruption")).toBeTruthy();
      expect(printed).toContain("Destroy your Crest");
    });

    it("without Super Skybound Art: crest remains on self", () => {
      setupTurn(R6, { hand: [CORRUPTION], pp: 5 });
      whenPlayCard("first", 0);
      expect(findCrest("first", "Corruption")).toBeTruthy();
    });
  });

  describe("Deprived Destroyer (10653110)", () => {
    const printed =
      "Fanfare: Select another allied follower on the field. If you selected one, destroy it and evolve this follower.\nWhen this follower evolves, summon a Bat and evolve it.";

    it("Fanfare with ally: destroys ally and evolves self", () => {
      setupTurn(R6, { hand: [DEPRIVED_DESTROYER], pp: 5 });
      const ally = allyFollower("Sacrifice", 1, 1);
      whenPlayCard("first", 0);
      resolvePendingByUid(ally.uid);
      expect(findOnBoard("first", "Sacrifice")).toBeFalsy();
      const dd = findOnBoard("first", "Deprived Destroyer")!;
      expect(dd.hasEvolved).toBe(true);
      expect(printed).toContain("destroy it and evolve");
    });

    it("Fanfare without other ally: does not evolve", () => {
      setupTurn(R6, { hand: [DEPRIVED_DESTROYER], pp: 5 });
      whenPlayCard("first", 0);
      const dd = findOnBoard("first", "Deprived Destroyer")!;
      expect(dd.hasEvolved).toBeFalsy();
    });

    it("When evolves: summons evolved Bat (90051120)", () => {
      setupTurn(R6, { hand: [DEPRIVED_DESTROYER], pp: 5, evo: 2 });
      const ally = allyFollower("Sacrifice", 1, 1);
      whenPlayCard("first", 0);
      resolvePendingByUid(ally.uid);
      const bat = thenBoard("first").find((c) => c.id === BAT);
      expect(bat).toBeTruthy();
      expect(bat!.hasEvolved).toBe(true);
      expect(printed).toContain("summon a Bat and evolve it");
    });
  });

  describe("Friendly Blue Ogre (10552120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and give it \"Can't attack followers or leaders\" until the end of your opponent's turn. Draw a card.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare silences enemy attacks and draws a card; bystander untouched", () => {
      setupTurn(R6, {
        hand: [FRIENDLY_BLUE_OGRE],
        deck: [FILLER, DRAW_TOP],
        pp: 5,
      });
      const target = enemyFollower(3, 3, "Target");
      const bystander = enemyFollower(2, 2, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(isCantAttackLocked(target)).toBe(true);
      expect(isCantAttackLocked(bystander)).toBe(false);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });

    it("Evolve replicates Fanfare on selected enemy", () => {
      setupTurn(R6, {
        hand: [FRIENDLY_BLUE_OGRE],
        deck: [FILLER, DRAW_TOP],
        pp: 5,
        evo: 2,
      });
      const target = enemyFollower(3, 3, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const ogre = findOnBoard("first", "Friendly Blue Ogre")!;
      whenEvolve(ogre, "first");
      resolvePendingByUid(target.uid);
      expect(isCantAttackLocked(target)).toBe(true);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Marsha, Dark Knight (10852120)", () => {
    const printed =
      "Fanfare: Deal 1 damage to all enemy followers and both leaders.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare: 1 damage to all enemy followers and both leaders", () => {
      setupTurn(R6, { hand: [MARSHA], pp: 5 });
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      const a = enemyFollower(2, 3, "A");
      const b = enemyFollower(2, 3, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(19);
      expect(getHP(state, "second")).toBe(19);
      expect(printed).toContain("both leaders");
    });

    it("Evolve replicates Fanfare damage", () => {
      setupTurn(R6, { hand: [MARSHA], pp: 5, evo: 2 });
      state.players.second.hp = 20;
      enemyFollower(2, 3, "A");
      whenPlayCard("first", 0);
      const marsha = findOnBoard("first", "Marsha, Dark Knight")!;
      whenEvolve(marsha, "first");
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Fiole, Devilish Matriarch (10852110)", () => {
    const printed =
      "Fanfare: Summon 3 copies of Bat.\nWhenever an allied Bat enters the field, give it Rush.";

    it("Fanfare summons 3 Bats (90051120)", () => {
      setupTurn(R6, { hand: [FIOLE], pp: 6 });
      whenPlayCard("first", 0);
      expect(thenBoard("first").filter((c) => c.id === BAT).length).toBe(3);
      expect(printed).toContain("Summon 3 copies of Bat");
    });

    it("allied Bat entering gains Rush during your turn", () => {
      setupTurn(R6, { hand: [BAT], pp: 1 });
      const fiole = createCard(FIOLE, "board", "first");
      fiole.peak_defense = fiole.defense;
      state.players.first.board = [fiole];
      whenPlayCard("first", 0);
      const bat = thenBoard("first").find(
        (c) => c.uid !== fiole.uid && c.id === BAT,
      )!;
      expect(bat.hasRush).toBe(true);
      expect(printed).toContain("give it Rush");
    });

    it("allied Bat entering gains Rush during opponent's turn too", () => {
      setupTurn(R6, { active: "second" });
      const fiole = createCard(FIOLE, "board", "first");
      fiole.peak_defense = fiole.defense;
      state.players.first.board = [fiole];
      const bat = summonFollowerByCardId(BAT, "first");
      expect(bat.hasRush).toBe(true);
      expect(printed).toContain("give it Rush");
    });
  });

  describe("Juggler Corvid (10752120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. Reanimate (2).";

    it("destroys selected enemy, Reanimate (2); bystander untouched", () => {
      setupTurn(R8, { hand: [JUGGLER_CORVID], pp: 6 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      const target = enemyFollower(2, 3, "Target");
      const bystander = enemyFollower(2, 3, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(Number(bystander.defense)).toBe(3);
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE)).toBe(
        true,
      );
      expect(printed).toContain("Reanimate (2)");
    });
  });

  describe("Milteo & Luzen (10554110)", () => {
    const printed =
      "Fanfare: Reanimate (4) and Reanimate (2).\nWhen this follower evolves, destroy 6 other random followers.\nWhen this follower super-evolves, gain Crest: Milteo & Luzen.";
    const crestPrinted =
      "Allied followers' Fanfare and Enhance abilities don't activate.\nWhenever you play a follower, evolve it.";

    it("cannot be played at 6 PP; playable at 7 PP", () => {
      setupTurn(R8, { hand: [MILTEO], pp: 6 });
      const blocked = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(blocked.kind).toBe("blocked");
      expect(findOnBoard("first", "Milteo & Luzen")).toBeFalsy();

      resetUidCounter();
      setupTurn(R8, { hand: [MILTEO], pp: 7 });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Milteo & Luzen")).toBeTruthy();
    });

    it("Fanfare Reanimate (4) and Reanimate (2) from graveyard", () => {
      setupTurn(R8, { hand: [MILTEO], pp: 7 });
      putCorpseInGraveyard(REANIMATE_CORPSE_4);
      putCorpseInGraveyard(REANIMATE_CORPSE);
      whenPlayCard("first", 0);
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE_4)).toBe(
        true,
      );
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE)).toBe(
        true,
      );
      expect(printed).toContain("Reanimate (4)");
    });

    it("Evolve destroys exactly 6 other followers; Milteo survives (3 allies + 3 enemies)", () => {
      setupTurn(R8, { hand: [MILTEO], pp: 7, evo: 2 });
      const allies = [
        allyFollower("Ally0", 1, 1),
        allyFollower("Ally1", 1, 1),
        allyFollower("Ally2", 1, 1),
      ];
      const enemies = [
        enemyFollower(1, 1, "Enemy0"),
        enemyFollower(1, 1, "Enemy1"),
        enemyFollower(1, 1, "Enemy2"),
      ];
      const otherUids = [...allies, ...enemies].map((c) => c.uid);
      whenPlayCard("first", 0);
      const milteo = findOnBoard("first", "Milteo & Luzen")!;
      const milteoUid = milteo.uid;
      whenEvolve(milteo, "first");
      cleanupDead();
      expect(findOnBoard("first", "Milteo & Luzen")?.uid).toBe(milteoUid);
      expect(thenBoard("first").length).toBe(1);
      expect(thenBoard("second").length).toBe(0);
      for (const uid of otherUids) {
        expect(isInEitherGraveyard(uid)).toBe(true);
      }
      expect(printed).toContain("destroy 6 other random followers");
    });

    it("Evolve destroys all 3 other followers when only 3 are on the field", () => {
      setupTurn(R8, { hand: [MILTEO], pp: 7, evo: 2 });
      const allies = [allyFollower("Ally0", 1, 1), allyFollower("Ally1", 1, 1)];
      const enemies = [enemyFollower(1, 1, "Enemy0")];
      const otherUids = [...allies, ...enemies].map((c) => c.uid);
      whenPlayCard("first", 0);
      const milteo = findOnBoard("first", "Milteo & Luzen")!;
      whenEvolve(milteo, "first");
      cleanupDead();
      expect(thenBoard("first").length).toBe(1);
      expect(thenBoard("second").length).toBe(0);
      for (const uid of otherUids) {
        expect(isInEitherGraveyard(uid)).toBe(true);
      }
      expect(findOnBoard("first", "Milteo & Luzen")).toBeTruthy();
    });

    it("Super-Evolve gains Crest: Milteo & Luzen", () => {
      setupTurn(R8, { hand: [MILTEO], pp: 7 });
      whenPlayCard("first", 0);
      const milteo = findOnBoard("first", "Milteo & Luzen")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(milteo, "first");
      expect(findCrest("first", "Milteo")).toBeTruthy();
      expect(crestPrinted).toContain("Whenever you play a follower");
    });

    it("crest: allied Fanfare does not activate on played follower", () => {
      setupTurn(R8, { hand: [MILTEO, NIGHT_FIEND], pp: 10 });
      whenPlayCard("first", 0);
      const milteo = findOnBoard("first", "Milteo & Luzen")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(milteo, "first");
      state.players.first.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(20);
      expect(playerHasCrestPassive("first", "suppress_fanfare_enhance")).toBe(
        true,
      );
      expect(crestPrinted).toContain("Fanfare and Enhance abilities don't");
    });

    it("crest: playing a follower evolves it", () => {
      setupTurn(R8, { hand: [MILTEO, GHOST_DODGER], pp: 10 });
      whenPlayCard("first", 0);
      const milteo = findOnBoard("first", "Milteo & Luzen")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(milteo, "first");
      whenPlayCard("first", 0);
      const dodger = findOnBoard("first", "Ghost Dodger")!;
      expect(dodger.hasEvolved).toBe(true);
      expect(crestPrinted).toContain("Whenever you play a follower");
    });
  });

  describe("Mistress of the Fanged (10051110)", () => {
    const printed = "Storm\nBane";

    it("enters with Storm and Bane", () => {
      setupTurn(R8, { hand: [MISTRESS], pp: 6 });
      whenPlayCard("first", 0);
      const mistress = findOnBoard("first", "Mistress of the Fanged")!;
      expect(mistress.hasStorm).toBe(true);
      expect(mistress.hasBane).toBe(true);
      expect(printed).toContain("Storm");
      expect(printed).toContain("Bane");
    });
  });

  describe("Nehan, Dispenser of Samsara (10453110)", () => {
    const printed =
      "Fanfare: Evolve all unevolved allied followers on the field. Deal 2 damage to your leader.\nDrain";

    it("Fanfare evolves unevolved allies and deals 2 to your leader", () => {
      setupTurn(R8, { hand: [NEHAN], pp: 6 });
      state.players.first.hp = 20;
      const raw = allyFollower("Raw", 2, 2);
      whenPlayCard("first", 0);
      expect(raw.hasEvolved).toBe(true);
      expect(getHP(state, "first")).toBe(18);
      const nehan = findOnBoard("first", "Nehan, Dispenser of Samsara")!;
      expect(nehan.hasDrain || nehan.keywords?.includes("Drain")).toBe(true);
      expect(printed).toContain("Evolve all unevolved");
    });
  });

  describe("Nezha, Soaring War God (10452110)", () => {
    const printed =
      "Rush.\nAt the end of your turn, deal 4 damage to a random enemy follower, then deal 2 damage to a random enemy follower.";

    it("enters with Rush; owner's EOT deals 4 then 2 to random enemies", () => {
      setupTurn(R8, { hand: [NEZHA], pp: 6 });
      const a = enemyFollower(2, 10, "A");
      const b = enemyFollower(2, 10, "B");
      whenPlayCard("first", 0);
      const nezha = findOnBoard("first", "Nezha, Soaring War God")!;
      expect(nezha.hasRush).toBe(true);
      const totalBefore = Number(a.defense) + Number(b.defense);
      runEndOfTurnBoundary("first");
      const totalAfter = Number(a.defense) + Number(b.defense);
      expect(totalBefore - totalAfter).toBe(6);
      expect(printed).toContain("deal 4 damage");
    });

    it("opponent's EOT: no random enemy damage", () => {
      setupTurn(R8, { hand: [NEZHA], pp: 6, active: "second" });
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      const defBefore = Number(foe.defense);
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(defBefore);
    });
  });

  describe("Vaseraga, Unyielding Scythe (10451120)", () => {
    const printed =
      "Intimidate. Last Words: Summon a Vaseraga, Unyielding Scythe. Deal 2 damage to your leader.";

    it("enters with Intimidate", () => {
      setupTurn(R8, { hand: [VASERAGA], pp: 6 });
      whenPlayCard("first", 0);
      const vas = findOnBoard("first", "Vaseraga, Unyielding Scythe")!;
      expect(vas.hasIntimidate).toBe(true);
      expect(printed).toContain("Intimidate");
    });

    it("Last Words summons copy and deals 2 to your leader", () => {
      setupTurn(R8, { hand: [VASERAGA], pp: 6 });
      state.players.first.hp = 20;
      whenPlayCard("first", 0);
      const vas = findOnBoard("first", "Vaseraga, Unyielding Scythe")!;
      applyKeywordsFromList(vas);
      vas.defense = 0;
      cleanupDead();
      expect(
        thenBoard("first").filter(
          (c) => c.name === "Vaseraga, Unyielding Scythe",
        ).length,
      ).toBe(1);
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Deal 2 damage to your leader");
    });
  });

  describe("Allure of the Mightiest (10652310)", () => {
    const printed =
      "Select an enemy follower on the field, banish it, and summon an exact copy of it.";

    it("banishes selected enemy (not destroy) and summons ally copy; LW suppressed", () => {
      setupTurn(R8, { hand: [ALLURE], pp: 7 });
      const target = enemyLastWordsFollower("BanishMe");
      const bystander = enemyFollower(2, 5, "Bystander");
      state.players.second.shadows = 0;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(getGraveyard(state, "second")).toHaveLength(0);
      expect(getBanish(state, "second").some((c) => c.uid === target.uid)).toBe(
        true,
      );
      expect(getShadows(state, "second")).toBe(0);
      expect(Number(bystander.defense)).toBe(5);
      expect(findOnBoard("first", "BanishMe")).toBeTruthy();
      expect(thenBoard("first").some((c) => c.name === "Skeleton")).toBe(false);
      expect(printed).toContain("banish it");
    });
  });

  describe("Beastmaster Bones (10753110)", () => {
    const printed =
      "Fanfare: Summon a Rotting Zombie and Skeleton.\nWhenever an allied Departed follower enters the field, give it Storm.\nSuper-Evolve: Select another allied follower on the field. If you selected one, destroy it and a random enemy follower.";

    it("Fanfare summons Rotting Zombie and Skeleton", () => {
      setupTurn(R8, { hand: [BEASTMASTER_BONES], pp: 7 });
      whenPlayCard("first", 0);
      expect(boardIds("first")).toContain(ROTTING_ZOMBIE);
      expect(boardIds("first")).toContain(SKELETON);
      expect(printed).toContain("Rotting Zombie and Skeleton");
    });

    it("Departed ally entering gains Storm during your turn", () => {
      setupTurn(R8, { hand: [GHOST], pp: 1 });
      const bones = createCard(BEASTMASTER_BONES, "board", "first");
      bones.peak_defense = bones.defense;
      state.players.first.board = [bones];
      whenPlayCard("first", 0);
      const ghost = thenBoard("first").find((c) => c.id === GHOST)!;
      expect(ghost.hasStorm).toBe(true);
      expect(printed).toContain("give it Storm");
    });

    it("Super-Evolve destroys selected ally and random enemy", () => {
      setupTurn(R8, { hand: [BEASTMASTER_BONES], pp: 7 });
      const ally = allyFollower("Sacrifice", 2, 2);
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      const bones = findOnBoard("first", "Beastmaster Bones")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(bones, "first");
      resolvePendingByUid(ally.uid);
      cleanupDead();
      expect(findOnBoard("first", "Sacrifice")).toBeFalsy();
      expect(getBoard(state, "second").length).toBe(0);
      expect(printed).toContain("destroy it and a random enemy follower");
    });
  });

  describe("Belial, Archangel of Cunning (10454120)", () => {
    const printed =
      "Fanfare: Deal 10 damage to all other followers.\nSuper Skybound Art- Gain Crest: Belial, Archangel of Cunning.\nSuper-Evolve: Advance the count of your Crest: Belial, Archangel of Cunning by 1.";
    const crestPrinted =
      "Countdown (4). Last Words: Deal 20 damage to the enemy leader.";

    it("Fanfare deals 10 to all other followers", () => {
      setupTurn(R10, { hand: [BELIAL], pp: 7 });
      const ally = allyFollower("Ally", 2, 12);
      const foe = enemyFollower(2, 12, "Foe");
      whenPlayCard("first", 0);
      expect(Number(ally.defense)).toBe(2);
      expect(Number(foe.defense)).toBe(2);
      const belial = findOnBoard("first", "Belial, Archangel of Cunning")!;
      expect(Number(belial.defense)).toBe(6);
      expect(printed).toContain("Deal 10 damage to all other followers");
    });

    it("Super Skybound Art: gains Crest: Belial with Countdown (4)", () => {
      setupTurn(R10, { hand: [BELIAL], pp: 7 });
      const card = getHand(state, "first").find((c) => c.id === BELIAL)!;
      card.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      const crest = findCrest("first", "Belial")!;
      expect(crest).toBeTruthy();
      expect(Number(crest.countdown)).toBe(4);
      expect(crestPrinted).toContain("Countdown (4)");
    });

    it("without Super Skybound Art: no crest on play", () => {
      setupTurn(R10, { hand: [BELIAL], pp: 7 });
      whenPlayCard("first", 0);
      expect(findCrest("first", "Belial")).toBeUndefined();
    });

    it("Super-Evolve advances crest countdown by 1", () => {
      setupTurn(R10, { hand: [BELIAL], pp: 7 });
      const card = getHand(state, "first").find((c) => c.id === BELIAL)!;
      card.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      const belial = findOnBoard("first", "Belial, Archangel of Cunning")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      const cdBefore = Number(findCrest("first", "Belial")!.countdown);
      whenSuperEvolve(belial, "first");
      expect(Number(findCrest("first", "Belial")!.countdown)).toBe(
        cdBefore - 1,
      );
      expect(printed).toContain("Advance the count");
    });

    it("crest Last Words at countdown 0: deals 20 to enemy leader", () => {
      setupTurn(R10, { hand: [BELIAL], pp: 7 });
      state.players.second.hp = 25;
      const card = getHand(state, "first").find((c) => c.id === BELIAL)!;
      card.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      const crest = findCrest("first", "Belial")!;
      crest.countdown = 1;
      runStartOfTurnBoundary("first", { tickCrests });
      expect(getHP(state, "second")).toBe(5);
      expect(findCrest("first", "Belial")).toBeUndefined();
      expect(crestPrinted).toContain("Deal 20 damage to the enemy leader");
    });
  });

  describe("Fediel, Darkness Personified (10454110)", () => {
    const printed =
      "Fanfare: Necromancy(6) -Reanimate(2), Reanimate(1), and evolve them.\nAt the end of your turn, give all enemy followers on the field -2/-2.";

    it("with Necromancy(6): reanimates and evolves followers", () => {
      setupTurn(R10, { hand: [FEDIEL], pp: 7 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      putCorpseInGraveyard(REANIMATE_CORPSE_1);
      state.players.first.shadows = 6;
      whenPlayCard("first", 0);
      const reanimated = thenBoard("first").filter(
        (c) =>
          c.uid !== findOnBoard("first", "Fediel, Darkness Personified")!.uid,
      );
      expect(reanimated.length).toBe(2);
      expect(reanimated.every((c) => c.hasEvolved)).toBe(true);
      expect(printed).toContain("Necromancy(6)");
    });

    it("without Necromancy(6): Fanfare does not reanimate", () => {
      setupTurn(R10, { hand: [FEDIEL], pp: 7 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      state.players.first.shadows = 5;
      whenPlayCard("first", 0);
      expect(thenBoard("first").length).toBe(1);
    });

    it("owner's EOT: all enemy followers -2/-2", () => {
      setupTurn(R10, { hand: [FEDIEL], pp: 7 });
      const foe = enemyFollower(4, 4, "Foe");
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(Number(foe.attack)).toBe(2);
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("-2/-2");
    });

    it("opponent's EOT: enemy followers unchanged", () => {
      setupTurn(R10, { hand: [FEDIEL], pp: 7, active: "second" });
      const foe = enemyFollower(4, 4, "Foe");
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(Number(foe.attack)).toBe(4);
      expect(Number(foe.defense)).toBe(4);
    });
  });

  describe("Harmony of Youth (10752310)", () => {
    const printed = "Summon a Ghost, Bat, and Skeleton and evolve them.";

    it("summons Ghost, Bat, Skeleton and evolves each", () => {
      setupTurn(R8, { hand: [HARMONY], pp: 7 });
      whenPlayCard("first", 0);
      const tokens = thenBoard("first").filter((c) =>
        [GHOST, BAT, SKELETON].includes(String(c.id)),
      );
      expect(tokens.length).toBe(3);
      expect(tokens.every((c) => c.hasEvolved)).toBe(true);
      expect(printed).toContain("evolve them");
    });
  });

  describe("Istyndet vs. Mitilykket (10954110)", () => {
    const printed =
      'Fanfare: Do this 3 times: "Reanimate (2)." Deal 2 damage to all enemy followers.\nSuper-Evolve: Gain Crest: Istyndet vs. Mitilykket.';
    const crestPrinted =
      "At the end of your turn, if there's an allied card on the field with Last Words, destroy a random allied card with Last Words and a random enemy follower.";

    it("Fanfare Reanimate (2) three times and 2 damage to all enemy followers", () => {
      setupTurn(R8, { hand: [ISTYNDET], pp: 7 });
      putCorpseInGraveyard(REANIMATE_CORPSE);
      putCorpseInGraveyard(REANIMATE_CORPSE);
      putCorpseInGraveyard(REANIMATE_CORPSE);
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(printed).toContain("Reanimate (2)");
    });

    it("Super-Evolve gains crest", () => {
      setupTurn(R8, { hand: [ISTYNDET], pp: 7 });
      whenPlayCard("first", 0);
      const isty = findOnBoard("first", "Istyndet vs. Mitilykket")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(isty, "first");
      expect(findCrest("first", "Istyndet")).toBeTruthy();
      expect(printed).toContain("Gain Crest");
    });

    it("crest owner's EOT with allied Last Words: destroys LW ally and random enemy", () => {
      setupTurn(R8, { hand: [ISTYNDET], pp: 7 });
      whenPlayCard("first", 0);
      const isty = findOnBoard("first", "Istyndet vs. Mitilykket")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(isty, "first");
      const lwAlly = allyFollower("LWAlly", 1, 2);
      lwAlly.hasLastWords = true;
      lwAlly.lastWordsEffects = [{ op: "draw", source: "deck", count: 1 }];
      const foe = enemyFollower(2, 5, "Foe");
      runEndOfTurnBoundary("first");
      cleanupDead();
      expect(findOnBoard("first", "LWAlly")).toBeFalsy();
      expect(getBoard(state, "second").length).toBe(0);
      expect(crestPrinted).toContain("Last Words");
    });

    it("crest owner's EOT without allied Last Words: no destroy", () => {
      setupTurn(R8, { hand: [ISTYNDET], pp: 7 });
      whenPlayCard("first", 0);
      const isty = findOnBoard("first", "Istyndet vs. Mitilykket")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(isty, "first");
      allyFollower("NoLW", 2, 2);
      const foe = enemyFollower(2, 5, "Foe");
      runEndOfTurnBoundary("first");
      expect(findOnBoard("first", "NoLW")).toBeTruthy();
      expect(Number(foe.defense)).toBe(5);
    });

    it("opponent's EOT: crest does not destroy", () => {
      setupTurn(R8, { pp: 7, active: "second" });
      const isty = createCard(ISTYNDET, "board", "first");
      isty.peak_defense = Number(isty.defense) || 1;
      state.players.first.board = [isty];
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(isty, "first");
      const lwAlly = allyFollower("LWAlly", 1, 2);
      lwAlly.hasLastWords = true;
      const foe = enemyFollower(2, 5, "Foe");
      runEndOfTurnBoundary("second");
      expect(findOnBoard("first", "LWAlly")).toBeTruthy();
      expect(Number(foe.defense)).toBe(5);
    });
  });

  describe("Sparkly Demoness (10952120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. Deal 2 damage to the enemy leader.";

    it("destroys selected enemy and deals 2 to enemy leader; bystander untouched", () => {
      setupTurn(R8, { hand: [SPARKLY_DEMONESS], pp: 7 });
      state.players.second.hp = 20;
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(Number(bystander.defense)).toBe(5);
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Deal 2 damage to the enemy leader");
    });
  });

  describe("Armes, Depletive Demon (10654110)", () => {
    const printed =
      'Aura\nCan\'t be destroyed by abilities.\nClash: Destroy the opposing follower.\nSuper-Evolve: Give this follower "Can attack 3 times per turn."';

    it("has Aura and ability destruction immunity", () => {
      setupTurn(R10, { hand: [ARMES], pp: 9 });
      whenPlayCard("first", 0);
      const armes = findOnBoard("first", "Armes, Depletive Demon")!;
      applyKeywordsFromList(armes);
      expect(armes.hasAura || armes.keywords?.includes("Aura")).toBe(true);
      expect(armes.keywordState?.cannotBeDestroyed).toBe(true);
      expect(printed).toContain("Can't be destroyed by abilities");
    });

    it("Clash — 10654110: Destroy the opposing follower", () => {
      setupTurn(R10, { hand: [ARMES], pp: 9 });
      whenPlayCard("first", 0);
      const armes = findOnBoard("first", "Armes, Depletive Demon")!;
      applyKeywordsFromList(armes);
      const bystander = allyFollower("Bystander", 1, 5);
      armes.can_attack = true;
      armes.can_attack_followers = true;
      armes.attacks_left = 1;
      armes.justPlayed = false;
      const foe = enemyFollower(2, 20, "ClashFoe");
      const bystanderUid = bystander.uid;
      const foeUid = foe.uid;
      attackFollower(0, 0, "first", "second");
      cleanupDead();
      expect(getBoard(state, "second").some((c) => c.uid === foeUid)).toBe(
        false,
      );
      expect(isInEitherGraveyard(bystanderUid)).toBe(false);
      expect(printed).toContain("Destroy the opposing follower");
    });

    it("Super-Evolve grants 3 attacks per turn", () => {
      setupTurn(R10, { hand: [ARMES], pp: 9 });
      whenPlayCard("first", 0);
      const armes = findOnBoard("first", "Armes, Depletive Demon")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(armes, "first");
      expect(Number(armes.attacks_per_turn ?? armes.attacksPerTurn)).toBe(3);
      expect(printed).toContain("Can attack 3 times per turn");
    });
  });

  describe("Lifestealer (10553110)", () => {
    const printed =
      "Fanfare: Transform all other followers on the field into copies of Skeleton.\nWhenever a Skeleton is destroyed, restore 1 defense to your leader.\nEvolve: Deal 1 damage to all other followers.";

    it("Fanfare transforms other followers into Skeletons", () => {
      setupTurn(R10, { hand: [LIFESTEALER], pp: 9 });
      allyFollower("Ally", 3, 3);
      enemyFollower(3, 3, "Foe");
      whenPlayCard("first", 0);
      const skels = [...thenBoard("first"), ...thenBoard("second")].filter(
        (c) => c.id === SKELETON,
      );
      expect(skels.length).toBe(2);
      expect(printed).toContain("Transform all other followers");
    });

    it("Skeleton destroyed restores 1 leader HP", () => {
      setupTurn(R10, { hand: [LIFESTEALER], pp: 9 });
      allyFollower("Ally", 3, 3);
      state.players.first.hp = 18;
      whenPlayCard("first", 0);
      const skel = thenBoard("first").find((c) => c.id === SKELETON)!;
      skel.defense = 0;
      cleanupDead();
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("restore 1 defense");
    });

    it("Evolve deals 1 damage to all other followers", () => {
      setupTurn(R10, { hand: [LIFESTEALER], pp: 9, evo: 2 });
      allyFollower("Ally", 3, 3);
      whenPlayCard("first", 0);
      const ls = findOnBoard("first", "Lifestealer")!;
      const skel = thenBoard("first").find((c) => c.id === SKELETON)!;
      whenEvolve(ls, "first");
      expect(Number(skel.defense)).toBe(0);
      cleanupDead();
      expect(Number(ls.defense)).toBe(9);
      expect(printed).toContain("Deal 1 damage to all other followers");
    });
  });

  describe("Shakdoh, Nightblossom (10554120)", () => {
    const printed =
      'Fanfare: Do this 2 times: "Return your hand to deck. Draw X cards. X is the number of cards you returned. Then, if you have at least 4 cards with the same cost in your hand, deal 4 damage to all enemies."\nSuper-Evolve: Replicate the effects of this card\'s Fanfare ability.';

    it("Fanfare returns hand to deck, draws X, and 4 same-cost deals 4 to all enemies twice", () => {
      setupTurn(R10, {
        hand: [SHAKDOH, SAME_COST_A, SAME_COST_B, SAME_COST_C, SAME_COST_D],
        deck: [FILLER, FILLER],
        pp: 10,
      });
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 6, "Foe");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(12);
      expect(getBoard(state, "second").length).toBe(0);
      expect(printed).toContain("4 cards with the same cost");
    });

    it("Fanfare with fewer than 4 same-cost after redraw: return-and-draw twice, no 4 damage", () => {
      setupTurn(R10, {
        hand: [SHAKDOH, MIXED_COST_1, MIXED_COST_2, MIXED_COST_3],
        pp: 10,
      });
      state.players.first.deck = [
        createCard(MIXED_COST_6, "deck", "first"),
        createCard(MIXED_COST_3, "deck", "first"),
        createCard(MIXED_COST_2, "deck", "first"),
        createCard(MIXED_COST_1, "deck", "first"),
        createCard(FILLER, "deck", "first"),
      ];
      state.players.second.deck = [
        createCard(FILLER, "deck", "second"),
        createCard(FILLER, "deck", "second"),
      ];
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 6, "Foe");
      const cardsBefore =
        handIds().length +
        deckIds().length +
        thenBoard("first").length +
        thenBoard("second").length;
      whenPlayCard("first", 0);
      const cardsAfter =
        handIds().length +
        deckIds().length +
        thenBoard("first").length +
        thenBoard("second").length;
      expect(cardsAfter).toBe(cardsBefore);
      expect(handIds().length).toBe(3);
      const costCounts = new Map<number, number>();
      for (const c of thenHand("first")) {
        const cost = Number(c.cost);
        costCounts.set(cost, (costCounts.get(cost) ?? 0) + 1);
      }
      expect(Math.max(...costCounts.values())).toBe(1);
      expect(getHP(state, "second")).toBe(20);
      expect(Number(foe.defense)).toBe(6);
      expect(getBoard(state, "second").length).toBe(1);
      expect(printed).toContain("Return your hand to deck");
    });

    it("Super-Evolve replicates Fanfare sequence", () => {
      setupTurn(R10, {
        hand: [SHAKDOH, SAME_COST_A, SAME_COST_B, SAME_COST_C, SAME_COST_D],
        deck: [FILLER],
        pp: 10,
      });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const shak = findOnBoard("first", "Shakdoh, Nightblossom")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      expect(getHP(state, "second")).toBe(12);
      whenSuperEvolve(shak, "first");
      expect(getHP(state, "second")).toBe(4);
      expect(printed).toContain("Replicate");
    });
  });
});
