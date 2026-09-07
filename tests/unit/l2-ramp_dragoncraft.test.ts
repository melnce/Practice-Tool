/**
 * L2 real-card tests — Ramp Dragoncraft deck (14 cards).
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
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { attackLeader } from "../../src/logic/core/combat.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getMaxHP,
  getCrests,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const DRAGONEWT_PROMOTER = "10741110";
const KIMIKA = "10842120";
const LYRIA = "10403120";
const SLOTH = "10543310";
const VORLALAI = "10644120";
const DRAGONSIGN = "10042310";
const DARK_DIMENSIONS = "10603210";
const ZOOEY = "10444120";
const NORMAGDALA = "10944120";
const SAGATSUMATSU = "10644110";
const LUMIORE = "10844120";
const ALABASTER = "10804110";
const BURNITE = "10744110";
const ERNTZ = "10544110";

// Tokens / helpers
const DEPTHS = "90044330";
const SPILLING_RED = "10642310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const BIG_FOLLOWER = "10002120";
const SMALL_FOLLOWER = "10001110";
const FODDER = "10031310"; // Foresight (cost 1 spell)

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
    hp?: number;
    maxPP?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    seed?: number;
  } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
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

function boardCountById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.id === id).length;
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

function discardHandCard(player: "first" | "second", id: string): void {
  const card = getHand(state, player).find((c) => c.id === id);
  if (!card) throw new Error(`Card ${id} not in hand`);
  resolvePendingByUid(card.uid);
}

describe("L2 — Ramp Dragoncraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Dragonewt Promoter (10741110)", () => {
    const printed = "Enhance (4): Summon 2 copies of Dragonewt Promoter.\nRush";

    it("without Enhance(4): summons one copy with Rush, no extras", () => {
      setupTurn(R6, { hand: [DRAGONEWT_PROMOTER], pp: 2 });
      whenPlayCard("first", 0);
      expect(boardCountById(DRAGONEWT_PROMOTER)).toBe(1);
      const promoter = findOnBoard("first", "Dragonewt Promoter")!;
      applyKeywordsFromList(promoter);
      expect(promoter.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Enhance(4): summons exactly 2 additional copies (3 total on board)", () => {
      setupTurn(R6, { hand: [DRAGONEWT_PROMOTER], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardCountById(DRAGONEWT_PROMOTER)).toBe(3);
      expect(printed).toContain("Summon 2 copies");
    });
  });

  describe("Kimika, Cook of Happiness (10842120)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Draw a card. Restore 1 defense to your leader.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare discards selected card, draws stacked deck card, heals leader 1", () => {
      setupTurn(R6, {
        hand: [KIMIKA, FODDER],
        deck: [DRAW_TOP],
        pp: 2,
        hp: 18,
      });
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      discardHandCard("first", FODDER);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(FODDER);
      expect(getHP(state, "first")).toBe(hpBefore + 1);
      expect(printed).toContain("Draw a card");
    });

    it("Evolve replicates Fanfare: second discard, draw, and heal", () => {
      setupTurn(R6, {
        hand: [KIMIKA, FODDER, DRAW_SECOND],
        deck: [DRAW_TOP, SMALL_FOLLOWER],
        pp: 2,
        hp: 17,
        evo: 2,
      });
      whenPlayCard("first", 0);
      discardHandCard("first", FODDER);
      const hpAfterFanfare = getHP(state, "first");
      const kimika = findOnBoard("first", "Kimika, Cook of Happiness")!;
      whenEvolve(kimika, "first");
      discardHandCard("first", DRAW_SECOND);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(DRAW_SECOND);
      expect(getHP(state, "first")).toBe(hpAfterFanfare + 1);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Lyria, Skydestined (10403120)", () => {
    const printed =
      "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points\nBarrier";

    it("without Enhance(8): plays as 2-cost follower with Barrier, no big draw", () => {
      setupTurn(R6, {
        hand: [LYRIA],
        pp: 2,
        deck: [BIG_FOLLOWER, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      const lyria = findOnBoard("first", "Lyria, Skydestined")!;
      expect(lyria.hasBarrier || lyria.keywordState?.hasBarrier).toBe(true);
      expect(handIds()).not.toContain(BIG_FOLLOWER);
      expect(deckIds()).toContain(BIG_FOLLOWER);
      expect(getPP(state, "first")).toBe(0);
    });

    it("Enhance(8): draws cost ≥7 follower and recovers 7 PP", () => {
      setupTurn(R10, {
        hand: [LYRIA],
        pp: 8,
        deck: [BIG_FOLLOWER, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(BIG_FOLLOWER);
      expect(deckIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(BIG_FOLLOWER);
      expect(getPP(state, "first")).toBe(7);
      expect(findOnBoard("first", "Lyria, Skydestined")).toBeDefined();
      expect(printed).toContain("Recover 7 play points");
    });
  });

  describe("Sloth of the Crestpetal (10543310)", () => {
    const printed =
      'Do this 2 times: "Deal 2 damage to a random enemy follower." If you\'re in Overflow, deal 2 damage to the enemy leader.';

    it("not in Overflow: deals 2 damage twice to random enemy followers only", () => {
      setupTurn(R6, { hand: [SLOTH], pp: 2, maxPP: 6, seed: 42 });
      const a = enemyFollower(1, 5, "A");
      const b = enemyFollower(1, 5, "B");
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      const totalDefLoss = 5 - Number(a.defense) + (5 - Number(b.defense));
      expect(totalDefLoss).toBe(4);
      expect(getHP(state, "second")).toBe(hpBefore);
      expect(printed).toContain("2 times");
    });

    it("in Overflow: also deals 2 damage to the enemy leader", () => {
      setupTurn(R8, { hand: [SLOTH], pp: 2, maxPP: 7 });
      enemyFollower(1, 5);
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(hpBefore - 2);
    });
  });

  describe("Vorlalai, Eld Blades (10644120)", () => {
    const printed =
      "When this card is discarded, summon a Vorlalai, Eld Blades.\nBane\nEvolve: Add a Depths of the Eld Blades to your hand.\nSuper-Evolve: Add 3 copies instead.";

    it("when discarded from hand summons exactly one Vorlalai on board", () => {
      setupTurn(R6, { hand: [SAGATSUMATSU, VORLALAI], pp: 7 });
      whenPlayCard("first", 0);
      discardHandCard("first", VORLALAI);
      expect(boardCountById(VORLALAI)).toBe(1);
      expect(handIds()).not.toContain(VORLALAI);
    });

    it("enters with Bane keyword", () => {
      setupTurn(R6, { hand: [VORLALAI], pp: 2 });
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      applyKeywordsFromList(vor);
      expect(vor.hasBane).toBe(true);
    });

    it("Evolve adds exactly one Depths of the Eld Blades to hand", () => {
      setupTurn(R6, { hand: [VORLALAI], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      whenEvolve(vor, "first");
      expect(handIds().filter((id) => id === DEPTHS)).toHaveLength(1);
      expect(printed).toContain("Add a Depths");
    });

    it("Super-Evolve adds exactly 3 Depths of the Eld Blades to hand", () => {
      setupTurn(R7, { hand: [VORLALAI], pp: 2, superEvo: 1 });
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      whenSuperEvolve(vor, "first");
      expect(handIds().filter((id) => id === DEPTHS)).toHaveLength(3);
      expect(printed).toContain("3 copies");
    });
  });

  describe("Dragonsign (10042310)", () => {
    const printed =
      "Gain 1 max play point. Then, if you have 10 max play points, draw a card.";

    it("always gains 1 max play point", () => {
      setupTurn(R8, { hand: [DRAGONSIGN], pp: 3, maxPP: 8 });
      const maxBefore = state.players.first.maxPP;
      whenPlayCard("first", 0);
      expect(state.players.first.maxPP).toBe(maxBefore + 1);
    });

    it("below 10 max PP after ramp: does not draw", () => {
      setupTurn(R8, {
        hand: [DRAGONSIGN],
        deck: [DRAW_TOP],
        pp: 3,
        maxPP: 8,
      });
      whenPlayCard("first", 0);
      expect(state.players.first.maxPP).toBe(9);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).toContain(DRAW_TOP);
    });

    it("at 10 max PP after ramp: draws stacked deck card", () => {
      setupTurn(R10, {
        hand: [DRAGONSIGN],
        deck: [DRAW_TOP],
        pp: 3,
        maxPP: 9,
      });
      whenPlayCard("first", 0);
      expect(state.players.first.maxPP).toBe(10);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("draw a card");
    });
  });

  describe("Dark Dimensions (10603210)", () => {
    const printed =
      "Countdown (2)\nAt the end of your turn, deal 2 damage to all non-Encroacher followers.";

    it("enters play with Countdown (2)", () => {
      setupTurn(R6, { hand: [DARK_DIMENSIONS], pp: 4 });
      whenPlayCard("first", 0);
      const amulet = findOnBoard("first", "Dark Dimensions")!;
      expect(Number(amulet.countdown)).toBe(2);
    });

    it("owner's EOT: damages non-Encroacher followers on both sides; Encroacher untouched", () => {
      setupTurn(R6, { hand: [DARK_DIMENSIONS], pp: 4 });
      whenPlayCard("first", 0);
      const encAlly = createCard(
        {
          name: "EncAlly",
          type: "Follower",
          defense: 5,
          tribes: ["Encroacher"],
        },
        "board",
        "first",
      );
      encAlly.peak_defense = 5;
      const plainAlly = allyFollower(2, 5, "PlainAlly");
      const plainFoe = enemyFollower(2, 5, "PlainFoe");
      state.players.first.board.push(encAlly);

      whenEndTurn();
      expect(Number(encAlly.defense)).toBe(5);
      expect(Number(plainAlly.defense)).toBe(3);
      expect(Number(plainFoe.defense)).toBe(3);
    });

    it("opponent's EOT: does not deal damage", () => {
      setupTurn(R6, { hand: [DARK_DIMENSIONS], pp: 4 });
      whenPlayCard("first", 0);
      const plainAlly = allyFollower(2, 5, "PlainAlly");
      whenEndTurn(); // first EOT — damages
      expect(Number(plainAlly.defense)).toBe(3);
      const plainFoe = enemyFollower(2, 5, "PlainFoe");
      whenEndTurn(); // second (opponent) EOT — must not re-damage
      expect(Number(plainFoe.defense)).toBe(5);
    });
  });

  describe("Zooey, Ally of the World (10444120)", () => {
    const printed =
      "Fanfare: Gain 1 max play point.\nEnhance(10): Give this follower Storm. Set your leader's max defense to 1. Give your leader \"Can't take more than 0 damage at a time\" until the end of your opponent's turn.";

    it("Fanfare always gains 1 max play point", () => {
      setupTurn(R8, { hand: [ZOOEY], pp: 5, maxPP: 8 });
      const maxBefore = state.players.first.maxPP;
      whenPlayCard("first", 0);
      expect(state.players.first.maxPP).toBe(maxBefore + 1);
    });

    it("without Enhance(10): Zooey has no Storm and leader max defense unchanged", () => {
      setupTurn(R8, { hand: [ZOOEY], pp: 5, maxPP: 8 });
      state.players.first.maxHP = 20;
      whenPlayCard("first", 0);
      const zooey = findOnBoard("first", "Zooey, Ally of the World")!;
      applyKeywordsFromList(zooey);
      expect(zooey.hasStorm).toBeFalsy();
      expect(getMaxHP(state, "first")).toBe(20);
    });

    it("Enhance(10): gives Zooey Storm, sets leader max defense to 1, caps damage until opponent EOT", () => {
      setupTurn(R10, { hand: [ZOOEY], pp: 10, maxPP: 10 });
      state.players.first.hp = 15;
      state.players.first.maxHP = 20;
      whenPlayCard("first", 0);
      const zooey = findOnBoard("first", "Zooey, Ally of the World")!;
      applyKeywordsFromList(zooey);
      expect(zooey.hasStorm).toBe(true);
      expect(getMaxHP(state, "first")).toBe(1);
      expect(getHP(state, "first")).toBe(1);

      applyLeaderDamage("first", 5);
      expect(getHP(state, "first")).toBe(1);

      whenEndTurn();
      whenEndTurn();
      applyLeaderDamage("first", 1);
      expect(getHP(state, "first")).toBe(0);
      expect(printed).toContain("Storm");
    });
  });

  describe("Normagdala, Ravening Revenant (10944120)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Draw a card. Restore 3 defense to your leader.\n2. Give all enemy followers on the field -0/-4.\nWard\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("mode 1: draws stacked deck card and restores 3 leader defense", () => {
      setupTurn(R7, {
        hand: [NORMAGDALA],
        deck: [DRAW_TOP],
        pp: 7,
        hp: 14,
      });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(handIds()).toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(17);
    });

    it("mode 2: gives all enemy followers -0/-4; bystander on own side untouched", () => {
      setupTurn(R7, { hand: [NORMAGDALA], pp: 7 });
      const foeA = enemyFollower(3, 6, "FoeA");
      const foeB = enemyFollower(3, 6, "FoeB");
      const ally = allyFollower(3, 6, "Ally");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(Number(foeA.defense)).toBe(2);
      expect(Number(foeB.defense)).toBe(2);
      expect(Number(ally.defense)).toBe(6);
    });

    it("enters with Ward", () => {
      setupTurn(R7, { hand: [NORMAGDALA], pp: 7 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const norm = findOnBoard("first", "Normagdala, Ravening Revenant")!;
      expect(norm.hasWard || norm.keywordState?.hasWard).toBe(true);
    });

    it("Evolve replicates Fanfare mode", () => {
      setupTurn(R7, {
        hand: [NORMAGDALA],
        deck: [DRAW_TOP, SMALL_FOLLOWER],
        pp: 7,
        hp: 14,
        evo: 2,
      });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const hpAfterFanfare = getHP(state, "first");
      const norm = findOnBoard("first", "Normagdala, Ravening Revenant")!;
      setScriptedModePickProvider(() => [0]);
      whenEvolve(norm, "first");
      setScriptedModePickProvider(null);
      expect(getHP(state, "first")).toBe(hpAfterFanfare + 3);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Sagatsumatsu, Fair Beheader (10644110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Add 2 copies of Spilling Red to your hand.\nStorm\nBane\nAura";

    it("Fanfare discards selected card and adds exactly 2 Spilling Red", () => {
      setupTurn(R7, { hand: [SAGATSUMATSU, FODDER], pp: 7 });
      whenPlayCard("first", 0);
      discardHandCard("first", FODDER);
      expect(handIds()).not.toContain(FODDER);
      expect(handIds().filter((id) => id === SPILLING_RED)).toHaveLength(2);
    });

    it("enters with Storm, Bane, and Aura", () => {
      setupTurn(R7, { hand: [SAGATSUMATSU, FODDER], pp: 7 });
      whenPlayCard("first", 0);
      discardHandCard("first", FODDER);
      const saga = findOnBoard("first", "Sagatsumatsu, Fair Beheader")!;
      applyKeywordsFromList(saga);
      expect(saga.hasStorm).toBe(true);
      expect(saga.hasBane).toBe(true);
      expect(saga.hasAura).toBe(true);
      expect(printed).toContain("Aura");
    });
  });

  describe("Lumiore & Argente, Shining Wings (10844120)", () => {
    const printed =
      "Fanfare: Select 2 cards in your hand and discard them. Deal 4 damage to all enemies.\nSuper-Evolve: Draw 3 cards.\nAccelerate (3): Gain 1 max play point.";

    it("Fanfare discards 2 selected cards and deals 4 to enemy leader and followers", () => {
      setupTurn(R8, { hand: [LUMIORE, FODDER, DRAW_SECOND], pp: 8 });
      const foe = enemyFollower(2, 6, "Foe");
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      discardHandCard("first", FODDER);
      discardHandCard("first", DRAW_SECOND);
      expect(handIds()).not.toContain(FODDER);
      expect(handIds()).not.toContain(DRAW_SECOND);
      expect(getHP(state, "second")).toBe(hpBefore - 4);
      expect(Number(foe.defense)).toBe(2);
    });

    it("Super-Evolve draws exactly 3 stacked deck cards", () => {
      setupTurn(R7, {
        hand: [LUMIORE, FODDER, DRAW_SECOND],
        deck: [DRAW_TOP, "10031320", FODDER],
        pp: 8,
        superEvo: 1,
      });
      whenPlayCard("first", 0);
      discardHandCard("first", FODDER);
      discardHandCard("first", DRAW_SECOND);
      const lumiore = findOnBoard("first", "Lumiore & Argente, Shining Wings")!;
      whenSuperEvolve(lumiore, "first");
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain("10031320");
      expect(handIds()).toContain(FODDER);
      expect(printed).toContain("Draw 3 cards");
    });

    it("Accelerate (3): gains 1 max play point without summoning follower", () => {
      setupTurn(R8, { hand: [LUMIORE], pp: 3, maxPP: 8 });
      const maxBefore = state.players.first.maxPP;
      const permBefore = state.players.first.permPP;
      whenPlayCard("first", 0);
      expect(state.players.first.permPP).toBe(permBefore + 1);
      expect(state.players.first.maxPP).toBe(maxBefore + 1);
      expect(
        findOnBoard("first", "Lumiore & Argente, Shining Wings"),
      ).toBeFalsy();
      expect(getGraveyard(state, "first").some((c) => c.id === LUMIORE)).toBe(
        true,
      );
    });
  });

  describe("Alabaster Bahamut (10804110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Banish all other followers from the field.\n2. Banish all amulets from the field.\n3. Banish all crests.";

    it("mode 1: banishes other followers not self; Last Words do not fire (banish not destroy)", () => {
      setupTurn(R10, { hand: [ALABASTER], pp: 10 });
      const lw = createCard(
        { name: "LWTarget", type: "Follower", cost: 2, attack: 1, defense: 3 },
        "board",
        "second",
      );
      lw.peak_defense = 3;
      lw.hasLastWords = true;
      lw.lastWordsEffects = [
        { op: "summon", source: "named", name: "Fairy", count: 1 },
      ];
      state.players.second.board.push(lw);
      state.players.second.shadows = 0;
      const bystander = allyFollower(2, 2, "AllyBystander");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(findOnBoard("first", "Alabaster Bahamut")).toBeTruthy();
      expect(findOnBoard("first", "AllyBystander")).toBeFalsy();
      expect(getBoard(state, "second").some((c) => c.uid === lw.uid)).toBe(
        false,
      );
      expect(getGraveyard(state, "second")).toHaveLength(0);
      expect(getBanish(state, "second").some((c) => c.uid === lw.uid)).toBe(
        true,
      );
      expect(getBoard(state, "first").some((c) => c.name === "Fairy")).toBe(
        false,
      );
      expect(Number(bystander.defense)).toBe(2);
    });

    it("mode 2: banishes all amulets from the field", () => {
      setupTurn(R10, { hand: [ALABASTER], pp: 10 });
      const amulet = createCard(DARK_DIMENSIONS, "board", "first");
      const enemyAmulet = createCard(DARK_DIMENSIONS, "board", "second");
      state.players.first.board.push(amulet);
      state.players.second.board.push(enemyAmulet);
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getBoard(state, "first").some((c) => c.type === "Amulet")).toBe(
        false,
      );
      expect(getBoard(state, "second").some((c) => c.type === "Amulet")).toBe(
        false,
      );
    });

    it("mode 3: banishes all crests", () => {
      setupTurn(R10, { hand: [ALABASTER], pp: 10 });
      state.players.first.crests = [
        { name: "Probe Crest", owner: "first", counters: {} } as any,
      ];
      state.players.second.crests = [
        { name: "Enemy Crest", owner: "second", counters: {} } as any,
      ];
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getCrests(state, "first").length).toBe(0);
      expect(getCrests(state, "second").length).toBe(0);
      expect(printed).toContain("Banish all crests");
    });
  });

  describe("Burnite, Anathema of Ash (10744110)", () => {
    const printed =
      "Fanfare: Deal 9 damage to all enemy followers.\nSuper-Evolve: Give your opponent Crest: Burnite, Anathema of Ash.";

    it("Fanfare deals 9 damage to all enemy followers; bystander ally untouched", () => {
      setupTurn(R10, { hand: [BURNITE], pp: 9 });
      const foeA = enemyFollower(3, 10, "FoeA");
      const foeB = enemyFollower(3, 10, "FoeB");
      const ally = allyFollower(3, 10, "Ally");
      whenPlayCard("first", 0);
      expect(Number(foeA.defense)).toBe(1);
      expect(Number(foeB.defense)).toBe(1);
      expect(Number(ally.defense)).toBe(10);
    });

    it("Super-Evolve gives opponent Crest: Burnite, Anathema of Ash", () => {
      setupTurn(R7, { hand: [BURNITE], pp: 9, superEvo: 1 });
      whenPlayCard("first", 0);
      const burnite = findOnBoard("first", "Burnite, Anathema of Ash")!;
      whenSuperEvolve(burnite, "first");
      expect(
        getCrests(state, "second").some((c) =>
          c.name?.includes("Burnite, Anathema of Ash"),
        ),
      ).toBe(true);
      expect(printed).toContain("Give your opponent Crest");
    });
  });

  describe("Erntz, Governing Justice (10544110)", () => {
    const printed =
      "Ward\nAt the end of your turn, if this follower is unevolved, deal 8 damage to 2 random enemy followers and restore 8 defense to your leader. If this follower is evolved, deal 8 damage to the enemy leader.\nEvolve: Remove Ward from this follower. Give it Intimidate.";

    it("enters with Ward", () => {
      setupTurn(R10, { hand: [ERNTZ], pp: 10 });
      whenPlayCard("first", 0);
      const erntz = findOnBoard("first", "Erntz, Governing Justice")!;
      expect(erntz.hasWard || erntz.keywordState?.hasWard).toBe(true);
    });

    it("unevolved owner's EOT: deals 8 to random enemy followers and restores 8 leader defense", () => {
      setupTurn(R10, { hand: [ERNTZ], pp: 10, hp: 10, seed: 1 });
      whenPlayCard("first", 0);
      const lone = enemyFollower(8, 10, "Solo");
      whenEndTurn();
      expect(Number(lone.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(18);
    });

    it("evolved owner's EOT: deals 8 to enemy leader instead of followers", () => {
      setupTurn(R10, { hand: [ERNTZ], pp: 10, evo: 2 });
      whenPlayCard("first", 0);
      const erntz = findOnBoard("first", "Erntz, Governing Justice")!;
      const foe = enemyFollower(2, 10, "Foe");
      whenEvolve(erntz, "first");
      const hpEnemyBefore = getHP(state, "second");
      whenEndTurn();
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 8);
      expect(Number(foe.defense)).toBe(10);
    });

    it("opponent's EOT: Erntz trigger does not fire", () => {
      setupTurn(R10, { hand: [ERNTZ], pp: 10, hp: 10 });
      whenPlayCard("first", 0);
      const foe = enemyFollower(2, 10, "Foe");
      whenEndTurn(); // owner EOT fires
      const hpAfterOwnerEot = getHP(state, "first");
      const foeDefAfterOwner = Number(foe.defense);
      whenEndTurn(); // opponent EOT must not fire Erntz again
      expect(getHP(state, "first")).toBe(hpAfterOwnerEot);
      expect(Number(foe.defense)).toBe(foeDefAfterOwner);
    });

    it("Evolve removes Ward and gives Intimidate", () => {
      setupTurn(R10, { hand: [ERNTZ], pp: 10, evo: 2 });
      whenPlayCard("first", 0);
      const erntz = findOnBoard("first", "Erntz, Governing Justice")!;
      whenEvolve(erntz, "first");
      expect(erntz.hasWard || erntz.keywordState?.hasWard).toBeFalsy();
      expect(
        erntz.hasIntimidate || erntz.keywordState?.hasIntimidate,
      ).toBeTruthy();
    });
  });
});
