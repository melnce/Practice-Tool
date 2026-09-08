/**
 * Official Cygames Q&A — Neutral batch 7 (pinned regression tests).
 * Assert exact outcomes from docs/official-qa.md; owner rulings override where noted.
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
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { playerHasCrestPassive } from "../../src/logic/effects/crest.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { canBeDestroyed } from "../../src/logic/effects/ops/destroy/primitives.js";
import { recordPlayedBaseCost } from "../../src/logic/core/playedBaseCostHistory.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import { faithCrestNameForCard } from "../../src/logic/faith/bootstrap.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getDeck,
  getGraveyard,
  getShadows,
} from "../../src/core/playerHelpers.js";
import { hasKeyword } from "../../src/logic/core/keywords/has.js";
import "../../src/logic/core/effects/index.js";

const DETECTIVE_LENS = "10001210";
const ADVENTURERS_GUILD = "10002210";
const SANDALPHON = "10404110";
const WORLD_OF_GAMES = "10503210";
const ENCROACHED_WORLD = "10602210";
const OMEGOTEP = "10604110";
const ALABASTER = "10804110";
const JAILOR = "10901110";
const AZVALDT = "10903210";
const ZERAEL = "10904110";
const RUBY = "10101110";
const OLIVIA = "10104110";
const DARK_SIDE = "10201310";
const GREATNESS = "10301310";
const DEMON = "90004130";

const FAIRY = "10001110";
const QUAKE = "10001130";
const DIVINE_THUNDER = "10103310";
const FENNIE = "10244120";
const TITANIA = "10214110";
const SERENE_SANCTUARY = "10161210";
const PACT = "10163210";
const HOLY_FALCON = "90061110";
const LILANTHIM_EDACITY = "10234110";
const LLOYD = "90074120";
const BLAZE_DESTROYER = "10032120";
const RUSTY = "10022120";
const ARRIET = "10002110";
const MILTEO = "10554110";
const SPELLBOOST_SPELL = "10031310";
const RULER_COCYTUS = "10104120";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    evo?: number;
    superEvo?: number;
    hp?: number;
    active?: "first" | "second";
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
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = opts.active ?? "first";
  if (opts.evo !== undefined) state.players.first.evoCharges = opts.evo;
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
  }
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
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

function allyFollower(atk = 2, def = 2, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function findCrestGain(card: Record<string, unknown>): unknown {
  let found: unknown;
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const rec = obj as Record<string, unknown>;
    if (rec.op === "crest" && rec.action === "gain") found = rec;
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(rec).forEach(walk);
  }
  walk(card);
  return found;
}

function gainCardCrest(cardId: string, owner: "first" | "second"): void {
  const card = getCardById(cardId);
  expect(card).toBeDefined();
  const gain = findCrestGain(card as Record<string, unknown>);
  expect(gain).toBeDefined();
  handleGainCrest(gain as Parameters<typeof handleGainCrest>[0], owner);
}

function gainMilteoCrest(): void {
  gainCardCrest(MILTEO, "first");
  expect(playerHasCrestPassive("first", "suppress_fanfare_enhance")).toBe(true);
}

function invokeSandalphonFromDeck(): void {
  state.players.first.evoCount = 6;
  whenEndTurn();
  whenEndTurn();
}

function handNames(): string[] {
  return thenHand("first").map((c) => c.name);
}

describe("official Q&A — Neutral batch 7", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("10001210 Detective's Lens", () => {
    it("10001210 Detective's Lens — Engage with no enemy Ward follower still destroys it (official Q&A)", () => {
      setupTurn(R6, { hand: [DETECTIVE_LENS], pp: 2 });
      whenPlayCard("first", 0);
      const lensIdx = getBoard(state, "first").findIndex(
        (c) => c.id === DETECTIVE_LENS,
      );
      expect(lensIdx).toBeGreaterThanOrEqual(0);
      engageAmulet("first", lensIdx);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(findOnBoard("first", "Detective's Lens")).toBeFalsy();
    }, 60_000);
  });

  describe("10002210 Adventurers' Guild", () => {
    it("10002210 Adventurers' Guild — Engage with no allied follower still destroys it (official Q&A)", () => {
      setupTurn(R6, { hand: [ADVENTURERS_GUILD], pp: 3 });
      whenPlayCard("first", 0);
      const idx = getBoard(state, "first").findIndex(
        (c) => c.id === ADVENTURERS_GUILD,
      );
      engageAmulet("first", idx);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(findOnBoard("first", "Adventurers' Guild")).toBeFalsy();
    }, 60_000);
  });

  describe("10404110 Sandalphon, Primarch Successor", () => {
    it("10404110 Sandalphon — returned to hand resets cost to 6 after Fennie halved deck cost (official Q&A)", () => {
      setupTurn(R6, {
        hand: [FENNIE],
        deck: [SANDALPHON, FAIRY],
        pp: 8,
      });
      whenPlayCard("first", 0);
      const sandInDeck = thenDeck("first").find((c) => c.id === SANDALPHON)!;
      expect(getEffectiveCost(sandInDeck)).toBe(3);
      invokeSandalphonFromDeck();
      const sandInHand = thenHand("first").find((c) => c.id === SANDALPHON)!;
      expect(sandInHand).toBeDefined();
      expect(getEffectiveCost(sandInHand)).toBe(6);
      expect(Number(sandInHand.cost)).toBe(6);
    }, 60_000);

    it("10404110 Sandalphon — SSA random pool includes leader when enemy followers are present (official Q&A)", () => {
      setupTurn(R10, { hand: [SANDALPHON], pp: 6, seed: 42 });
      state.players.second.hp = 20;
      enemyFollower(1, 1, "Fairy");
      const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
      sand.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      expect(findOnBoard("second", "Fairy")).toBeFalsy();
      expect(20 - getHP(state, "second")).toBe(8);

      resetUidCounter();
      setupTurn(R10, { hand: [SANDALPHON], pp: 6, seed: 42 });
      state.players.second.hp = 20;
      const wall = enemyFollower(2, 20, "Wall");
      const sandSolo = getHand(state, "first").find(
        (c) => c.id === SANDALPHON,
      )!;
      sandSolo.skyboundArtEvolvesWitnessed = 15;
      whenPlayCard("first", 0);
      const wallDamage = 20 - Number(wall.defense);
      const leaderDamage = 20 - getHP(state, "second");
      expect(wallDamage + leaderDamage).toBe(10);
    }, 60_000);

    it("10404110 Sandalphon — Titania Fairy then invoke then return then draw at SOT (official Q&A)", () => {
      setupTurn(R6, { hand: [], deck: [SANDALPHON, FAIRY], pp: 6 });
      gainCardCrest(TITANIA, "first");
      const handBefore = thenHand("first").length;
      invokeSandalphonFromDeck();
      expect(handNames()).toContain("Fairy");
      expect(handNames()).toContain("Sandalphon, Primarch Successor");
      expect(thenBoard("first").length).toBe(0);
      expect(thenHand("first").length).toBe(handBefore + 3);
    }, 60_000);

    it("10404110 Sandalphon — Serene Sanctuary (10161210) invoke then LW draw then return at SOT (official Q&A)", () => {
      setupTurn(R6, { hand: [], deck: [SANDALPHON, FAIRY, FAIRY], pp: 6 });
      const sanctuary = createCard(SERENE_SANCTUARY, "board", "first");
      sanctuary.countdown = 1;
      sanctuary.hasCountdown = true;
      state.players.first.board = [sanctuary];
      const handBefore = thenHand("first").length;
      invokeSandalphonFromDeck();
      expect(findOnBoard("first", "Serene Sanctuary")).toBeFalsy();
      expect(handNames()).toContain("Sandalphon, Primarch Successor");
      expect(thenBoard("first").length).toBe(0);
      expect(thenHand("first").length).toBe(handBefore + 3);
    }, 60_000);

    it("10404110 Sandalphon — Pact LW cannot summon Holyflame Tiger when field is full (official Q&A)", () => {
      setupTurn(R6, {
        hand: [PACT],
        deck: [SANDALPHON, FAIRY],
        pp: 6,
      });
      whenPlayCard("first", 0);
      const pactIdx = getBoard(state, "first").findIndex((c) => c.id === PACT);
      engageAmulet("first", pactIdx);
      for (let i = 0; i < 4; i++) {
        state.players.first.board.push(
          createCard(HOLY_FALCON, "board", "first"),
        );
      }
      state.players.first.evoCount = 6;
      state.activePlayer = "second";
      whenEndTurn();
      expect(findOnBoard("first", "Pact of the Beast Princess")).toBeFalsy();
      expect(
        thenBoard("first").filter((c) => c.name === "Holy Falcon"),
      ).toHaveLength(4);
      expect(findOnBoard("first", "Holyflame Tiger")).toBeFalsy();
      expect(handNames()).toContain("Sandalphon, Primarch Successor");
      expect(thenBoard("first").length).toBe(4);
    }, 60_000);
  });

  describe("10503210 World of Games", () => {
    it("10503210 World of Games — Divine Thunder matching enemy Quake Goliath base cost advances count to 4 (official Q&A)", () => {
      setupTurn(R6, {
        hand: [DIVINE_THUNDER],
        pp: 4,
        seed: 7,
      });
      const games = createCard(WORLD_OF_GAMES, "board", "first");
      games.countdown = 5;
      games.hasCountdown = true;
      state.players.first.board = [games];
      enemyFollower(4, 5, "Quake Goliath");
      const quake = findOnBoard("second", "Quake Goliath")!;
      quake.id = QUAKE;
      (quake as { base_cost?: number }).base_cost = 4;
      whenPlayCard("first", 0);
      expect(Number(games.countdown)).toBe(4);
    }, 60_000);
  });

  describe("10602210 Encroached World", () => {
    it("10602210 Encroached World — Engage with empty hand does nothing (official Q&A)", () => {
      setupTurn(R6, { hand: [], pp: 3 });
      const encroached = createCard(ENCROACHED_WORLD, "board", "first");
      state.players.first.board = [encroached];
      state.players.first.hand = [];
      state.players.second.deck = [createCard(FAIRY, "deck", "second")];
      const deckBefore = getDeck(state, "second").length;
      engageAmulet("first", 0);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(thenHand("first").length).toBe(0);
      expect(getDeck(state, "second").length).toBe(deckBefore);
      expect(findOnBoard("first", "Encroached World")).toBeTruthy();
    }, 60_000);
  });

  describe("10604110 Omegotep, the Dreaded One", () => {
    it("10604110 Omegotep — Milteo crest blocks Fanfare when super-evolve picks +4/+4 (official Q&A)", () => {
      setupTurn(R10, { hand: [], pp: 9, seed: 5 });
      gainMilteoCrest();
      enemyFollower(1, 10, "OmegotepFoe");
      const omeg = createCard(OMEGOTEP, "board", "first");
      omeg.peak_defense = omeg.defense;
      state.players.first.board = [omeg];
      const hpBeforeSuper = getHP(state, "second");
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      setScriptedModePickProvider(() => [3, 3]);
      handleEvolveSelf(omeg, "first", { mode: "super", spendPoint: true });
      setScriptedModePickProvider(null);
      expect(Number(omeg.attack)).toBe(11);
      expect(getHP(state, "second")).toBe(hpBeforeSuper);

      resetUidCounter();
      setupTurn(R10, { hand: [OMEGOTEP], pp: 9, seed: 5 });
      enemyFollower(1, 10, "OmegotepFoe2");
      whenPlayCard("first", 0);
      const omegPlain = findOnBoard("first", "Omegotep, the Dreaded One")!;
      const hpBeforePlainSuper = getHP(state, "second");
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      handleEvolveSelf(omegPlain, "first", {
        mode: "super",
        spendPoint: true,
      });
      expect(getHP(state, "second")).toBe(hpBeforePlainSuper - 2);
    }, 60_000);
  });

  describe("10804110 Alabaster Bahamut — option 3 banish faiths", () => {
    it("10804110 Alabaster Bahamut — option 3 banish faiths doesn't banish faith (official Q&A)", () => {
      setupTurn(R10, { hand: [ALABASTER], pp: 10 });
      state.players.first.crests = [
        { name: "Probe Crest", owner: "first", counters: {} } as any,
      ];
      const faithName = faithCrestNameForCard("Sathanid, Eld Lance");
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: faithName,
          is_faith: true,
        } as any,
        "first",
      );
      crestAddCounter("first", faithName, "faith", 3);
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(
        getCrests(state, "first").some((c) => c.name === "Probe Crest"),
      ).toBe(false);
      expect(getCrests(state, "first").some((c) => c.name === faithName)).toBe(
        true,
      );
      expect(
        getCrests(state, "first").find((c) => c.name === faithName)?.counters
          ?.faith,
      ).toBe(3);
    }, 60_000);
  });

  describe("10901110 Jailor of Antiquity", () => {
    it("10901110 Jailor — Accelerate form base cost is 1 (owner ruling 2026-09-06)", () => {
      setupTurn(R6, { hand: [JAILOR], pp: 1 });
      enemyFollower(2, 5, "Wall");
      const shadowsBefore = getShadows(state, "first");
      expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
        "done",
      );
      const costs = state.players.first.playedBaseCostsThisMatch;
      expect(costs).toContain(1);
      expect(costs).not.toContain(6);
      const gy = getGraveyard(state, "first").find((c) => c.id === JAILOR)!;
      expect(gy.type).toBe("Spell");
      expect(Number(gy.cost)).toBe(1);
      expect(Number(gy.base_cost)).toBe(1);
      expect(
        Number(
          (gy as { originalPrintedBaseCost?: number }).originalPrintedBaseCost,
        ),
      ).toBe(6);
      expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
      expect(getPP(state, "first")).toBe(0);
    }, 60_000);

    it("10901110 Jailor — random 2 damage still hits Aura follower when first select fails (official Q&A)", () => {
      setupTurn(R6, { hand: [JAILOR], pp: 6 });
      const lil = createCard(LILANTHIM_EDACITY, "board", "second");
      lil.defense = 5;
      lil.peak_defense = 5;
      applyKeywordsFromList(lil);
      state.players.second.board = [lil];
      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(Number(lil.defense)).toBe(3);
      expect(findOnBoard("first", "Jailor of Antiquity")).toBeTruthy();
    }, 60_000);
  });

  describe("10903210 Azvaldt, Penitentiary of Chaos", () => {
    it("10903210 Azvaldt — self-destroy then Zerael invoke then Azvaldt Last Words at EOT (official Q&A)", () => {
      setupTurn(R10, { hand: [], deck: [ZERAEL, FAIRY], pp: 8 });
      const azvaldt = createCard(AZVALDT, "board", "first");
      state.players.first.board = [azvaldt];
      recordDestroyed(state, "first", createCard(FAIRY, "graveyard", "first"));
      for (let c = 1; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
      const zeraelUid = thenDeck("first").find((c) => c.id === ZERAEL)!.uid;
      whenEndTurn();
      expect(
        findOnBoard("first", "Azvaldt, Penitentiary of Chaos"),
      ).toBeFalsy();
      const zeraelBoard = thenBoard("first").find((c) => c.uid === zeraelUid);
      expect(zeraelBoard).toBeDefined();
      expect(thenBoard("first").some((c) => c.id === FAIRY)).toBe(true);
    }, 60_000);
  });

  describe("10101110 Ruby, Greedy Cherub", () => {
    it("10101110 Ruby — Fanfare draws when it is the only card in hand (official Q&A)", () => {
      setupTurn(R6, {
        hand: [RUBY],
        pp: 2,
        deck: [{ name: "DeckTop", type: "Follower", attack: 1, defense: 1 }],
      });
      const deckBefore = thenDeck("first").length;
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Ruby, Greedy Cherub")).toBeTruthy();
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(thenDeck("first").length).toBe(deckBefore - 1);
      expect(handNames()).toContain("DeckTop");
    }, 60_000);

    it("10101110 Ruby — Blaze Destroyer keeps spellboosted cost 5 after return to deck (official Q&A)", () => {
      setupTurn(R6, {
        hand: [RUBY, BLAZE_DESTROYER, SPELLBOOST_SPELL],
        pp: 2,
        deck: [{ name: "DrawMe", type: "Follower", attack: 1, defense: 1 }],
      });
      const blaze = getHand(state, "first").find(
        (c) => c.id === BLAZE_DESTROYER,
      )!;
      spellboostHand("first", 5, blaze);
      expect(Number(blaze.cost)).toBe(5);
      whenPlayCard("first", 0);
      resolvePendingByUid(blaze.uid);
      const blazeInDeck = thenDeck("first").find(
        (c) => c.id === BLAZE_DESTROYER,
      )!;
      expect(getEffectiveCost(blazeInDeck)).toBe(5);
    }, 60_000);

    it("10101110 Ruby — Rusty keeps Storm after return to deck (official Q&A)", () => {
      setupTurn(R6, {
        hand: [RUBY, RUSTY],
        pp: 2,
        deck: [{ name: "DrawMe", type: "Follower", attack: 1, defense: 1 }],
      });
      const rusty = getHand(state, "first").find((c) => c.id === RUSTY)!;
      rusty.hasStorm = true;
      applyKeywordsFromList(rusty);
      whenPlayCard("first", 0);
      resolvePendingByUid(rusty.uid);
      const rustyInDeck = thenDeck("first").find((c) => c.id === RUSTY)!;
      expect(hasKeyword(rustyInDeck, "Storm")).toBe(true);
    }, 60_000);
  });

  describe("10104110 Olivia, Heroic Dark Angel", () => {
    it("10104110 Olivia — super-evolving Quake Goliath grants SEP protections and leader ping (official Q&A)", () => {
      setupTurn(R10, { hand: [OLIVIA], pp: 7, superEvo: 1 });
      const goliath = allyFollower(4, 5, "Quake Goliath");
      goliath.id = QUAKE;
      whenPlayCard("first", 0);
      const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      state.players.first.evoUsedThisTurn = false;
      handleEvolveSelf(olivia, "first", { mode: "super", spendPoint: true });
      resolvePendingByUid(goliath.uid);
      expect(goliath.evoType).toBe("super");
      expect(canBeDestroyed(goliath, "first")).toBe(false);
      const dmg = dealDamage(goliath, 99, "second");
      expect(dmg.damage).toBe(0);
      enemyFollower(1, 1, "Victim");
      goliath.can_attack = true;
      goliath.can_attack_followers = true;
      goliath.attacks_left = 1;
      goliath.hasAttacked = false;
      goliath.justPlayed = false;
      applyKeywordsFromList(goliath);
      state.players.second.hp = 20;
      const atkIdx = getBoard(state, "first").findIndex(
        (c) => c.uid === goliath.uid,
      );
      attackFollower(atkIdx, 0, "first", "second");
      cleanupDead();
      expect(getHP(state, "second")).toBe(19);
    }, 60_000);

    it("10104110 Olivia — super-evolving Arriet does not fire her Evolve/Super-Evolve restores (official Q&A)", () => {
      setupTurn(R10, { hand: [OLIVIA], pp: 7, hp: 15, superEvo: 1 });
      const arriet = allyFollower(3, 3, "Arriet, Luxminstrel");
      arriet.id = ARRIET;
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(17);
      const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
      handleEvolveSelf(olivia, "first", { mode: "super", spendPoint: true });
      resolvePendingByUid(arriet.uid);
      expect(getHP(state, "first")).toBe(17);
      expect(arriet.evoType).toBe("super");

      resetUidCounter();
      setupTurn(R7, { hand: [ARRIET], pp: 3, hp: 15, superEvo: 1 });
      whenPlayCard("first", 0);
      const solo = findOnBoard("first", "Arriet, Luxminstrel")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      handleEvolveSelf(solo, "first", { mode: "super", spendPoint: true });
      expect(getHP(state, "first")).toBe(19);
    }, 60_000);
  });

  describe("10201310 Dark Side", () => {
    it("10201310 Dark Side — cannot select allied follower while enemy Lloyd is on the field (official Q&A)", () => {
      setupTurn(R6, { hand: [DARK_SIDE], pp: 2 });
      const ally = allyFollower(1, 4, "Ally");
      const lloyd = createCard(LLOYD, "board", "second");
      lloyd.peak_defense = lloyd.defense;
      state.players.second.board = [lloyd];
      whenPlayCard("first", 0);
      const pending = state.pendingTargetEffect!;
      expect(validateTargetSelection(state, pending, ally.uid).ok).toBe(false);
      expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
      resolvePendingByUid(lloyd.uid);
      expect(Number(lloyd.defense)).toBe(4);
      expect(Number(ally.defense)).toBe(4);

      resetUidCounter();
      setupTurn(R6, { hand: [DARK_SIDE], pp: 2 });
      const allyOnly = allyFollower(1, 4, "AllyOnly");
      whenPlayCard("first", 0);
      const pending2 = state.pendingTargetEffect!;
      expect(validateTargetSelection(state, pending2, allyOnly.uid).ok).toBe(
        true,
      );
      resolvePendingByUid(allyOnly.uid);
      expect(Number(allyOnly.attack)).toBe(3);
      expect(Number(allyOnly.defense)).toBe(2);
    }, 60_000);
  });

  describe("10301310 Greatness Ascended", () => {
    function greatnessFiller(name: string) {
      return {
        name,
        type: "Follower" as const,
        attack: 1,
        defense: 1,
        cost: 1,
      };
    }

    function setupGreatness(deckNames: string[]) {
      setupTurn(R10, {
        hand: [GREATNESS],
        pp: 10,
        deck: deckNames.map(greatnessFiller),
      });
    }

    it("10301310 Greatness Ascended — duplicates before play, none after draw: no PP recover (official Q&A)", () => {
      setupGreatness(["C", "D", "A", "A", "B"]);
      whenPlayCard("first", 0);
      expect(getPP(state, "first")).toBe(6);
      expect(thenDeck("first").map((c) => c.name)).toEqual(["C", "D"]);
      expect(thenHand("first").map((c) => c.name)).toEqual(["B", "A", "A"]);
    }, 60_000);

    it("10301310 Greatness Ascended — no duplicates in deck: recovers 3 PP (official Q&A control)", () => {
      setupGreatness(["A", "B", "C", "D", "E"]);
      whenPlayCard("first", 0);
      expect(getPP(state, "first")).toBe(9);
      expect(thenDeck("first").map((c) => c.name)).toEqual(["A", "B"]);
      expect(thenHand("first").map((c) => c.name)).toEqual(["E", "D", "C"]);
    }, 60_000);

    it("10301310 Greatness Ascended — duplicates before and after draw: no PP recover (official Q&A control)", () => {
      setupGreatness(["A", "A", "C", "D", "E"]);
      whenPlayCard("first", 0);
      expect(getPP(state, "first")).toBe(6);
      expect(thenDeck("first").map((c) => c.name)).toEqual(["A", "A"]);
      expect(thenHand("first").map((c) => c.name)).toEqual(["E", "D", "C"]);
    }, 60_000);
  });

  describe("90004130 Demon of Purgatory", () => {
    it("90004130 Demon of Purgatory — Fanfare still deals 6 to the enemy leader with no followers (official Q&A)", () => {
      setupTurn(R10, { hand: [RULER_COCYTUS], pp: 10 });
      whenPlayCard("first", 0);
      const demon = createCard(DEMON, "hand", "first");
      state.players.first.hand = [demon];
      state.players.first.pp = 5;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(14);
      expect(state.pendingTargetEffect).toBeFalsy();

      resetUidCounter();
      setupTurn(R10, { hand: [DEMON], pp: 5 });
      const targetA = enemyFollower(1, 8, "TargetA");
      const targetB = enemyFollower(1, 8, "TargetB");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(targetA.uid);
      resolvePendingByUid(targetB.uid);
      expect(getHP(state, "second")).toBe(14);
      expect(Number(targetA.defense)).toBe(2);
    }, 60_000);
  });
});
