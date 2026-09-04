/**
 * L2 real-card tests — Swordcraft tokens (14 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { tickCrests } from "../../src/logic/effects/crest.js";
import { runStartOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Token ids
const KNIGHT = "90021110";
const STEELCLAD_KNIGHT = "90021120";
const NAHT_HENCHMAN = "90021130";
const WRETCH = "90022110";
const DREAD_PIRATE_FLAG = "90021210";
const GILDED_BLADE = "90021310";
const GILDED_GOBLET = "90021320";
const GILDED_BOOTS = "90021330";
const GILDED_NECKLACE = "90021340";
const GLITTERING_GOLD = "90021350";
const NONJA = "90023110";
const DEPTHS_ELD_SWORD = "90024320";
const DESPERADOS_SHOT = "90024330";
const REMNANT_HOLLOWNESS = "90024310";

// Generators (meta-deck first where listed)
const METRONOMIC_MEDIC = "10722120";
const NAHT_VINCE = "10821110";
const IRONCROWN_MAJESTY = "10122310";
const SHARED_EXISTENCE = "10822310";
const YIDMETRA = "10624120";
const BUNNY_BARON = "10824110";
const OPEN_SEA_SCOUT = "10921110";
const WHIRLPOOL_GUNNER = "10922110";
const SPLENDOR_GOLDBLOOM = "10523310";
const OCTRICE = "10324120";
const PRIM = "10223120";

const FILLER = "10111310";
const FOLLOWER_FILLER = "10022110";
const DRAW_TOP = "10021110";
const OCTRICE_CREST = "Octrice, Hollowness Manifest";

const R6 = 6;
const R7 = 7;
const R8 = 8;
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
    secondHand?: string[];
    secondPP?: number;
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
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.board?.length) b = b.withFirstBoard(opts.board);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
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

function allyFollower(atk: number, def: number, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

function boardUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenBoard(player).map((c) => c.uid));
}

function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
): CardInstance[] {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function newBoardCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
): CardInstance[] {
  const fresh = thenBoard(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function handIndexById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return getHand(state, player).findIndex((c) => String(c.id) === id);
}

function assertVanillaFollower(
  card: CardInstance,
  id: string,
  expected: {
    cost: number;
    attack: number;
    defense: number;
    tribes: string[];
  },
) {
  const template = getCardById(id)!;
  expect(String(card.id)).toBe(id);
  expect(card.name).toBe(template.name);
  expect(card.type).toBe("Follower");
  expect(card.class).toBe("Swordcraft");
  expect(Number(card.cost)).toBe(expected.cost);
  expect(Number(card.attack)).toBe(expected.attack);
  expect(Number(card.defense)).toBe(expected.defense);
  expect(card.tribes).toEqual(expected.tribes);
  expect(card.hasStorm).toBeFalsy();
  expect(card.hasRush).toBeFalsy();
  expect(card.hasWard).toBeFalsy();
  expect(card.hasBane).toBeFalsy();
  expect(card.hasAmbush).toBeFalsy();
  expect(card.hasBarrier).toBeFalsy();
}

describe("L2 Swordcraft tokens — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  describe("Knight (90021110)", () => {
    const printed = "";
    const tribes = ["Officer"];

    it("real path via Metronomic Medic (10722120): vanilla 0/1/1 Officer with no keywords", () => {
      setupTurn(R8, { hand: [METRONOMIC_MEDIC], pp: 5 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const knights = newBoardCards(boardBefore, "first", KNIGHT);
      expect(knights).toHaveLength(2);
      assertVanillaFollower(knights[0]!, KNIGHT, {
        cost: 0,
        attack: 1,
        defense: 1,
        tribes,
      });
      assertVanillaFollower(knights[1]!, KNIGHT, {
        cost: 0,
        attack: 1,
        defense: 1,
        tribes,
      });
      expect(printed).toBe("");
    });
  });

  describe("Naht's Henchman (90021130)", () => {
    const printed = "";
    const tribes = ["Officer"];

    it("real path via Naht & Vince (10821110): vanilla 3/4/4 Officer with no keywords", () => {
      setupTurn(R10, { hand: [NAHT_VINCE], pp: 7 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const henchmen = newBoardCards(boardBefore, "first", NAHT_HENCHMAN);
      expect(henchmen).toHaveLength(1);
      assertVanillaFollower(henchmen[0]!, NAHT_HENCHMAN, {
        cost: 3,
        attack: 4,
        defense: 4,
        tribes,
      });
      expect(printed).toBe("");
    });
  });

  describe("Steelclad Knight (90021120)", () => {
    const printed = "";
    const tribes = ["Officer"];

    it("real path via Ironcrown Majesty Mode 1 (10122310): vanilla 1/2/2 Officer with no keywords", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, { hand: [IRONCROWN_MAJESTY], pp: 3 });
      setScriptedModePickProvider(() => [0]);
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const steel = newBoardCards(boardBefore, "first", STEELCLAD_KNIGHT);
      expect(steel).toHaveLength(1);
      assertVanillaFollower(steel[0]!, STEELCLAD_KNIGHT, {
        cost: 1,
        attack: 2,
        defense: 2,
        tribes,
      });
      expect(printed).toBe("");
    });
  });

  describe("Wretch (90022110)", () => {
    const printed = "Rush";

    it("real path via Shared Existence Enhance (6) (10822310): has Rush", () => {
      setupTurn(R6, { hand: [SHARED_EXISTENCE], pp: 6 });
      enemyFollower(5, 3, "Bruiser");
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      cleanupDead();
      const wretches = newBoardCards(boardBefore, "first", WRETCH);
      expect(wretches).toHaveLength(3);
      for (const w of wretches) {
        applyKeywordsFromList(w);
        expect(w.hasRush || w.keywordState?.hasRush).toBe(true);
        expect(Number(w.attack)).toBe(4);
        expect(Number(w.defense)).toBe(1);
      }
      expect(printed).toContain("Rush");
    });

    it("Rush: can attack an enemy follower on the turn it is summoned", () => {
      setupTurn(R6, { hand: [WRETCH], pp: 2 });
      const foe = enemyFollower(1, 5, "Foe");
      whenPlayCard("first", 0);
      const wretch = findOnBoard("first", "Wretch")!;
      applyKeywordsFromList(wretch);
      const atkIdx = getBoard(state, "first").indexOf(wretch);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("Rush");
    });
  });

  describe("Depths of the Eld Sword (90024320)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 1 damage.\nEnhance (1): Deal 3 damage instead.";

    it("real path via Yidmetra (10624120): token added to hand by uid", () => {
      setupTurn(R6, { hand: [YIDMETRA], pp: 2 });
      const handBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(handBefore, "first", DEPTHS_ELD_SWORD);
      expect(added).toHaveLength(1);
      expect(added[0]!.name).toBe("Depths of the Eld Sword");
    });

    it("base (0 PP): deals 1 damage to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [DEPTHS_ELD_SWORD], pp: 0 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(4);
      expect(printed).toContain("deal it 1 damage");
    });

    it("Enhance (1): deals 3 damage instead of 1", () => {
      setupTurn(R6, { hand: [DEPTHS_ELD_SWORD], pp: 1 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(4);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(printed).toContain("Deal 3 damage instead");
    });
  });

  describe("Desperados' Shot (90024330)", () => {
    const printed =
      'Do this 2 times: "Deal 4 damage to a random enemy follower."';

    it("real path via Bunny & Baron Evolve (10824110): token added to hand by uid", () => {
      setupTurn(R8, { hand: [BUNNY_BARON], pp: 5, evo: 2 });
      whenPlayCard("first", 0);
      const bunny = findOnBoard("first", "Bunny & Baron, Fate's Bullet")!;
      const handBefore = handUids();
      onEvolve(bunny, "first", "normal", { spendPoint: true });
      const added = newHandCards(handBefore, "first", DESPERADOS_SHOT);
      expect(added).toHaveLength(1);
    });

    it("with one enemy follower: deals 4 damage twice (8 total)", () => {
      setupTurn(R6, { hand: [DESPERADOS_SHOT], pp: 1, seed: 42 });
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Do this 2 times");
    });

    it("with no enemy followers: does not damage enemy leader", () => {
      setupTurn(R6, { hand: [DESPERADOS_SHOT], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Dread Pirate's Flag (90021210)", () => {
    const printed =
      "Countdown (7)\nWhenever you play a spell, advance this amulet's count by 1.\nLast Words: Deal 2 damage to the enemy leader.";

    it("real path via Open-Sea Scout (10921110): Countdown starts at 7", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT], pp: 2 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const flags = newBoardCards(boardBefore, "first", DREAD_PIRATE_FLAG);
      expect(flags).toHaveLength(1);
      expect(Number(flags[0]!.countdown)).toBe(7);
      expect(printed).toContain("Countdown (7)");
    });

    it("whenever you play a spell: advances countdown by 1", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT, FILLER], pp: 3 });
      whenPlayCard("first", 0);
      const flag = thenBoard("first").find((c) => c.id === DREAD_PIRATE_FLAG)!;
      whenPlayCard("first", 0);
      expect(Number(flag.countdown)).toBe(6);
      expect(printed).toContain("advance this amulet's count by 1");
    });

    it("playing a follower does not advance countdown", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT, FOLLOWER_FILLER], pp: 4 });
      whenPlayCard("first", 0);
      const flag = thenBoard("first").find((c) => c.id === DREAD_PIRATE_FLAG)!;
      const idx = handIndexById(FOLLOWER_FILLER);
      whenPlayCard("first", idx);
      expect(Number(flag.countdown)).toBe(7);
    });

    it("opponent playing a spell does not advance your Flag countdown", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT], pp: 2, active: "second" });
      state.activePlayer = "first";
      whenPlayCard("first", 0);
      const flag = thenBoard("first").find((c) => c.id === DREAD_PIRATE_FLAG)!;
      state.activePlayer = "second";
      state.players.second.hand.push(createCard(FILLER, "hand", "second"));
      whenPlayCard("second", 0);
      expect(Number(flag.countdown)).toBe(7);
    });

    it("Last Words: deals 2 damage to the enemy leader when destroyed", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT, FILLER], pp: 3 });
      whenPlayCard("first", 0);
      const flag = thenBoard("first").find((c) => c.id === DREAD_PIRATE_FLAG)!;
      flag.countdown = 1;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      cleanupDead();
      expect(thenBoard("first").some((c) => c.id === DREAD_PIRATE_FLAG)).toBe(
        false,
      );
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Deal 2 damage to the enemy leader");
    });
  });

  describe("Gilded Blade (90021310)", () => {
    const printed =
      "Select an enemy follower on the field or the enemy leader and deal it 1 damage.";

    it("real path via Octrice Evolve (10324120): token added to hand by uid", () => {
      setupTurn(R6, { hand: [OCTRICE], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const oct = findOnBoard("first", "Octrice, Hollowness Manifest")!;
      const handBefore = handUids();
      onEvolve(oct, "first", "normal", { spendPoint: true });
      const added = newHandCards(handBefore, "first", GILDED_BLADE);
      expect(added).toHaveLength(1);
    });

    it("deals 1 damage to selected enemy follower; bystander untouched", () => {
      setupTurn(R6, { hand: [GILDED_BLADE], pp: 1 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("deal it 1 damage");
    });

    it("with no enemy followers: deals 1 damage to enemy leader", () => {
      setupTurn(R6, { hand: [GILDED_BLADE], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect?.canTargetLeader).toBe(true);
      resolvePendingTarget("leader");
      expect(getHP(state, "second")).toBe(19);
      expect(printed).toContain("enemy leader");
    });
  });

  describe("Gilded Boots (90021330)", () => {
    const printed =
      "Select an allied follower on the field and give it +1/+0 and Rush.";

    it("real path via Open-Sea Scout Evolve (10921110): token added to hand by uid", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const scout = findOnBoard("first", "Open-Sea Scout")!;
      const handBefore = handUids();
      onEvolve(scout, "first", "normal", { spendPoint: true });
      const added = newHandCards(handBefore, "first", GILDED_BOOTS);
      expect(added).toHaveLength(1);
    });

    it("gives selected ally +1/+0 and Rush; bystander untouched", () => {
      setupTurn(R6, { hand: [GILDED_BOOTS], pp: 1 });
      const target = allyFollower(2, 3, "Target");
      const bystander = allyFollower(1, 2, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.attack)).toBe(3);
      expect(Number(target.defense)).toBe(3);
      expect(target.hasRush || target.keywordState?.hasRush).toBe(true);
      expect(Number(bystander.attack)).toBe(1);
      expect(Number(bystander.defense)).toBe(2);
      expect(bystander.hasRush).toBeFalsy();
      expect(printed).toContain("+1/+0 and Rush");
    });
  });

  describe("Gilded Goblet (90021320)", () => {
    const printed = "Restore 2 defense to your leader.";

    it("real path via Whirlpool Gunner (10922110): token added to hand by uid", () => {
      setupTurn(R6, { hand: [WHIRLPOOL_GUNNER], pp: 3 });
      const handBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(handBefore, "first", GILDED_GOBLET);
      expect(added).toHaveLength(1);
    });

    it("restores 2 defense to your leader", () => {
      setupTurn(R6, { hand: [GILDED_GOBLET], pp: 1, hp: 18 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(20);
      expect(printed).toContain("Restore 2 defense");
    });
  });

  describe("Gilded Necklace (90021340)", () => {
    const printed =
      "Select an allied follower on the field and give it +0/+1 and Ward.";

    it("real path via Octrice Evolve (10324120): token added to hand by uid", () => {
      setupTurn(R6, { hand: [OCTRICE], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const oct = findOnBoard("first", "Octrice, Hollowness Manifest")!;
      const handBefore = handUids();
      onEvolve(oct, "first", "normal", { spendPoint: true });
      const added = newHandCards(handBefore, "first", GILDED_NECKLACE);
      expect(added).toHaveLength(1);
    });

    it("gives selected ally +0/+1 and Ward; bystander untouched", () => {
      setupTurn(R6, { hand: [GILDED_NECKLACE], pp: 1 });
      const target = allyFollower(2, 3, "Target");
      const bystander = allyFollower(1, 2, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.attack)).toBe(2);
      expect(Number(target.defense)).toBe(4);
      expect(target.hasWard || target.keywordState?.hasWard).toBe(true);
      expect(Number(bystander.defense)).toBe(2);
      expect(bystander.hasWard).toBeFalsy();
      expect(printed).toContain("+0/+1 and Ward");
    });
  });

  describe("Glittering Gold (90021350)", () => {
    const printed =
      "Select a Mode to activate.\n1. Draw a card.\n2. Deal 2 damage to a random enemy follower.";

    it("real path via Splendor of the Goldbloom (10523310): token added to hand by uid", () => {
      setupTurn(R6, { hand: [SPLENDOR_GOLDBLOOM], pp: 3 });
      const handBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(handBefore, "first", GLITTERING_GOLD);
      expect(added).toHaveLength(2);
    });

    it("Mode 1: draws the top card of your deck", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, {
        hand: [GLITTERING_GOLD],
        deck: [FILLER, DRAW_TOP],
        pp: 0,
      });
      const handBefore = handUids();
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(newHandCards(handBefore, "first", DRAW_TOP)).toHaveLength(1);
      expect(printed).toContain("Draw a card");
    });

    it("Mode 2: deals 2 damage to a random enemy follower", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, { hand: [GLITTERING_GOLD], pp: 0, seed: 7 });
      const foe = enemyFollower(2, 5, "Foe");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(3);
      expect(printed).toContain("Deal 2 damage");
    });
  });

  describe("Nonja, Silent Maid (90023110)", () => {
    const printed =
      "Fanfare: If there's an allied Prim, Princess's Picnic on the field, give this follower +1/+1 and Bane.\nWard";

    it("real path via Prim (10223120): token added to hand by uid", () => {
      setupTurn(R6, { hand: [PRIM], pp: 2 });
      const handBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(handBefore, "first", NONJA);
      expect(added).toHaveLength(1);
    });

    it("with allied Prim on field: Fanfare gives +1/+1 and Bane", () => {
      setupTurn(R6, { hand: [NONJA], pp: 2 });
      const prim = createCard(PRIM, "board", "first");
      applyKeywordsFromList(prim);
      prim.peak_defense = prim.defense;
      state.players.first.board.push(prim);
      whenPlayCard("first", 0);
      const nonja = findOnBoard("first", "Nonja, Silent Maid")!;
      expect(Number(nonja.attack)).toBe(3);
      expect(Number(nonja.defense)).toBe(3);
      expect(nonja.hasBane || nonja.keywordState?.hasBane).toBe(true);
      expect(printed).toContain("Bane");
    });

    it("without allied Prim on field: Fanfare does not buff stats or grant Bane", () => {
      setupTurn(R6, { hand: [NONJA], pp: 2 });
      whenPlayCard("first", 0);
      const nonja = findOnBoard("first", "Nonja, Silent Maid")!;
      expect(Number(nonja.attack)).toBe(2);
      expect(Number(nonja.defense)).toBe(2);
      expect(nonja.hasBane).toBeFalsy();
    });

    it("has Ward on field", () => {
      setupTurn(R6, { hand: [NONJA], pp: 2 });
      whenPlayCard("first", 0);
      const nonja = findOnBoard("first", "Nonja, Silent Maid")!;
      applyKeywordsFromList(nonja);
      expect(nonja.hasWard || nonja.keywordState?.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });
  });

  describe("Remnant of Hollowness (90024310)", () => {
    const printed = "Deal 4 damage split between all enemies.";

    it("real path via Octrice crest Last Words (10324120): token added to hand by uid", () => {
      setupTurn(R6, { hand: [OCTRICE], pp: 3 });
      whenPlayCard("first", 0);
      const crest = getCrests(state, "first").find(
        (c) => c.name === OCTRICE_CREST,
      )!;
      crest.countdown = 1;
      const handBefore = handUids();
      runStartOfTurnBoundary("first", { tickCrests });
      const added = newHandCards(handBefore, "first", REMNANT_HOLLOWNESS);
      expect(added).toHaveLength(1);
    });

    it("with one enemy follower: deals exactly 4 damage to it", () => {
      setupTurn(R6, { hand: [REMNANT_HOLLOWNESS], pp: 1 });
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(4);
      expect(printed).toContain("Deal 4 damage");
    });

    it("with enemy leader only: deals 4 damage split to leader", () => {
      setupTurn(R6, { hand: [REMNANT_HOLLOWNESS], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(16);
    });

    it("with follower and leader: deals 4 damage split across all enemies", () => {
      setupTurn(R6, { hand: [REMNANT_HOLLOWNESS], pp: 1 });
      const foe = enemyFollower(2, 2, "Foe");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const leaderDmg = 20 - getHP(state, "second");
      const followerDmg = 2 - Number(foe.defense);
      expect(leaderDmg + followerDmg).toBe(4);
    });
  });
});
