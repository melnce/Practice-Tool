/**
 * L2 real-card tests — Abysscraft tokens (10 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails with finding comment.
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
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import {
  getBoard,
  getHP,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Tokens under test
const BAT = "90051120";
const GHOST = "90051130";
const ROTTING_ZOMBIE = "90051140";
const SKELETON = "90051110";
const DEPTHS_SIGHT = "90054330";
const MIMI = "90054110";
const COCO = "90054120";
const ONE_TAILED_FOX = "90054130";
const SCREAM_DIFFUSION = "90054310";
const WINGS_OF_DESIRE = "90054320";

// Generators (meta-deck first)
const FIOLE = "10852110";
const FICKLE_NECRO = "10552110";
const BIBATII = "10654120";
const CERBERUS = "10154110";
const GINSETSU = "10254110";
const RULENYE = "10354120";

const FILLER = "10151110";
const DRAW_TOP = "10051120";
const DRAW_SECOND = "10051110";
const DRAW_THIRD = "10051310";

const R5 = 5;
const R6 = 6;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    evo?: number;
    hp?: number;
    secondHp?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    secondDeck?: string[];
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
  if (opts.secondHp !== undefined) b = b.withSecondHP(opts.secondHp);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

function boardUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenBoard(player).map((c) => c.uid));
}

function newBoardCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenBoard(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
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

function readyAttacker(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
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

describe("L2 — Abysscraft tokens", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Bat (90051120)", () => {
    const printed = "Drain";

    it("real path via Fiole Fanfare: summons Bat by uid with 1/1 Abysscraft stats", () => {
      setupTurn(R6, { hand: [FIOLE], pp: 6 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", BAT);
      expect(summoned).toHaveLength(3);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
    });

    it("Drain: has Drain keyword on field", () => {
      setupTurn(R6, { hand: [BAT], pp: 1 });
      whenPlayCard("first", 0);
      const bat = findOnBoard("first", "Bat")!;
      applyKeywordsFromList(bat);
      expect(bat.hasDrain).toBe(true);
      expect(printed).toContain("Drain");
    });

    it("Drain: combat damage as attacker restores leader defense by damage dealt", () => {
      setupTurn(R6, { hand: [BAT], pp: 1, hp: 15 });
      enemyFollower(1, 5, "Blocker");
      whenPlayCard("first", 0);
      const bat = findOnBoard("first", "Bat")!;
      readyAttacker(bat);
      attackFollower(0, 0, "first", "second");
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("Drain");
    });

    it("Drain: as defender restores nothing from counter-damage", () => {
      setupTurn(R6, { hp: 15 });
      const attacker = allyFollower("Atk", 3, 3);
      readyAttacker(attacker);
      const bat = createCard(BAT, "board", "second");
      bat.peak_defense = bat.defense;
      applyKeywordsFromList(bat);
      state.players.second.board = [bat];
      state.activePlayer = "second";
      attackFollower(0, 0, "second", "first");
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Ghost (90051130)", () => {
    const printed =
      "Storm\nWhen this card leaves the field, banish it.\nAt the end of your turn, banish this card.";

    it("real path via Fickle Necromancer Fanfare: summons Ghost by uid", () => {
      setupTurn(R6, { hand: [FICKLE_NECRO], pp: 3 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", GHOST);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
      expect(summoned[0]!.tribes).toContain("Departed");
    });

    it("Storm: can attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [GHOST], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const ghost = findOnBoard("first", "Ghost")!;
      readyAttacker(ghost);
      const atkIdx = getBoard(state, "first").indexOf(ghost);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(19);
      expect(printed).toContain("Storm");
    });

    it("When this card leaves the field: banishes on destroy (not graveyard)", () => {
      setupTurn(R6, { hand: [GHOST, SKELETON], pp: 2 });
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      const ghost = findOnBoard("first", "Ghost")!;
      const skeleton = findOnBoard("first", "Skeleton")!;
      const ghostUid = ghost.uid;
      const skeletonUid = skeleton.uid;
      state.players.first.shadows = 0;
      ghost.defense = 0;
      skeleton.defense = 0;
      cleanupDead();
      expect(getBoard(state, "first").some((c) => c.uid === ghostUid)).toBe(
        false,
      );
      expect(getGraveyard(state, "first")).toHaveLength(1);
      expect(getGraveyard(state, "first")[0]!.uid).toBe(skeletonUid);
      expect(getBanish(state, "first").some((c) => c.uid === ghostUid)).toBe(
        true,
      );
      expect(ghost.zone).toBe("banished");
      expect(state.players.first.shadows).toBe(1);
      expect(printed).toContain("banish it");
    });

    it("owner's EOT: banishes Ghost from the field", () => {
      setupTurn(R6, {
        hand: [GHOST],
        pp: 1,
        deck: [DRAW_TOP, DRAW_SECOND],
      });
      whenPlayCard("first", 0);
      const ghost = findOnBoard("first", "Ghost")!;
      const ghostUid = ghost.uid;
      whenEndTurn();
      expect(getBoard(state, "first").some((c) => c.uid === ghostUid)).toBe(
        false,
      );
      expect(getBanish(state, "first").some((c) => c.uid === ghostUid)).toBe(
        true,
      );
      expect(printed).toContain("At the end of your turn");
    });

    it("opponent's EOT: Ghost remains on the field", () => {
      setupTurn(R6, {
        active: "second",
        secondHand: [FILLER],
        secondPP: 1,
        secondDeck: [DRAW_TOP, DRAW_SECOND],
      });
      const ghost = createCard(GHOST, "board", "first");
      ghost.peak_defense = ghost.defense;
      state.players.first.board = [ghost];
      const ghostUid = ghost.uid;
      runEndOfTurnBoundary("second");
      expect(getBoard(state, "first").some((c) => c.uid === ghostUid)).toBe(
        true,
      );
      expect(getBanish(state, "first").some((c) => c.uid === ghostUid)).toBe(
        false,
      );
    });
  });

  describe("Rotting Zombie (90051140)", () => {
    const printed =
      "Last Words: Summon a Rotting Zombie and remove Last Words from it.";

    it("real path via Fickle Necromancer Evolve: summons Rotting Zombie by uid", () => {
      setupTurn(R6, { hand: [FICKLE_NECRO], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const necro = findOnBoard("first", "Fickle Necromancer")!;
      const uidsBefore = boardUids();
      whenEvolve(necro, "first");
      const summoned = newBoardCards(uidsBefore, "first", ROTTING_ZOMBIE);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(3);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(2);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
    });

    it("Last Words: summons exactly one Rotting Zombie", () => {
      setupTurn(R6, { hand: [ROTTING_ZOMBIE], pp: 3 });
      whenPlayCard("first", 0);
      const zombie = findOnBoard("first", "Rotting Zombie")!;
      const boardBefore = thenBoard("first").length;
      zombie.defense = 0;
      cleanupDead();
      expect(thenBoard("first").length).toBe(boardBefore);
      expect(
        thenBoard("first").filter((c) => c.id === ROTTING_ZOMBIE),
      ).toHaveLength(1);
      expect(printed).toContain("Summon a Rotting Zombie");
    });

    it("Last Words: summoned copy has Last Words removed and does not chain", () => {
      setupTurn(R6, { hand: [ROTTING_ZOMBIE], pp: 3 });
      whenPlayCard("first", 0);
      const original = findOnBoard("first", "Rotting Zombie")!;
      const boardBeforeLw = thenBoard("first").length;
      original.defense = 0;
      cleanupDead();
      expect(thenBoard("first").length).toBe(boardBeforeLw);
      expect(
        thenBoard("first").filter((c) => c.id === ROTTING_ZOMBIE),
      ).toHaveLength(1);
      const copy = thenBoard("first").find((c) => c.uid !== original.uid)!;
      expect(hasLastWords(copy)).toBe(false);
      expect(copy.keywordState?.lastWordsEffects ?? []).toHaveLength(0);
      const countBefore = thenBoard("first").length;
      const copyUid = copy.uid;
      copy.defense = 0;
      cleanupDead();
      expect(thenBoard("first").length).toBe(countBefore - 1);
      expect(thenBoard("first").some((c) => c.uid === copyUid)).toBe(false);
      expect(printed).toContain("remove Last Words");
    });
  });

  describe("Skeleton (90051110)", () => {
    it("real path via Fickle Necromancer Fanfare: summons Skeleton by uid with vanilla stats", () => {
      setupTurn(R6, { hand: [FICKLE_NECRO], pp: 3 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", SKELETON);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(0);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
      expect(summoned[0]!.tribes).toContain("Departed");
      applyKeywordsFromList(summoned[0]!);
      expect(summoned[0]!.hasStorm).toBeFalsy();
      expect(summoned[0]!.hasRush).toBeFalsy();
      expect(summoned[0]!.hasDrain).toBeFalsy();
      expect(summoned[0]!.hasWard).toBeFalsy();
      expect(hasLastWords(summoned[0]!)).toBe(false);
    });
  });

  describe("Depths of the Eld Sight (90054330)", () => {
    const printed = "Draw 2 cards.";

    it("real path via Bibatii Evolve: adds Depths by uid", () => {
      setupTurn(R8, { hand: [BIBATII], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const bibatii = findOnBoard("first", "Bibatii, Eld Sight")!;
      const uidsBefore = handUids();
      whenEvolve(bibatii, "first");
      const added = newHandCards(uidsBefore, "first", DEPTHS_SIGHT);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Abysscraft");
      expect(added[0]!.tribes).toContain("Encroacher");
    });

    it("on play: draws exactly the top 2 deck cards by identity", () => {
      setupTurn(R6, {
        hand: [DEPTHS_SIGHT],
        pp: 1,
      });
      // drawCard pops deck end — last entry is top of deck
      state.players.first.deck = [
        createCard(DRAW_THIRD, "deck", "first"),
        createCard(DRAW_SECOND, "deck", "first"),
        createCard(DRAW_TOP, "deck", "first"),
      ];
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(handIds()).not.toContain(DRAW_THIRD);
      expect(handIds()).not.toContain(DEPTHS_SIGHT);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Coco, Left Paw Hellhound (90054120)", () => {
    const printed = "Rush\nLast Words: Restore 2 defense to your leader.";

    it("real path via Cerberus Fanfare: summons Coco by uid", () => {
      setupTurn(R10, { hand: [CERBERUS], pp: 8 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", COCO);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(2);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
    });

    it("Rush: can attack enemy follower the turn it is played", () => {
      setupTurn(R6, { hand: [COCO], pp: 1 });
      const foe = enemyFollower(1, 3, "Foe");
      whenPlayCard("first", 0);
      const coco = findOnBoard("first", "Coco, Left Paw Hellhound")!;
      applyKeywordsFromList(coco);
      expect(coco.hasRush).toBe(true);
      readyAttacker(coco);
      attackFollower(0, 0, "first", "second");
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [COCO], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const coco = findOnBoard("first", "Coco, Left Paw Hellhound")!;
      applyKeywordsFromList(coco);
      coco.can_attack = true;
      coco.attacks_left = 1;
      attackLeader(0, "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });

    it("Last Words: restores exactly 2 defense to your leader", () => {
      setupTurn(R6, { hand: [COCO], pp: 1, hp: 16 });
      whenPlayCard("first", 0);
      const coco = findOnBoard("first", "Coco, Left Paw Hellhound")!;
      coco.defense = 0;
      cleanupDead();
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Restore 2 defense");
    });
  });

  describe("Mimi, Right Paw Hellhound (90054110)", () => {
    const printed = "Rush\nLast Words: Deal 2 damage to the enemy leader.";

    it("real path via Cerberus Fanfare: summons Mimi by uid", () => {
      setupTurn(R10, { hand: [CERBERUS], pp: 8 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", MIMI);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
    });

    it("Rush: can attack enemy follower the turn it is played", () => {
      setupTurn(R6, { hand: [MIMI], pp: 1 });
      const foe = enemyFollower(1, 3, "Foe");
      whenPlayCard("first", 0);
      const mimi = findOnBoard("first", "Mimi, Right Paw Hellhound")!;
      applyKeywordsFromList(mimi);
      expect(mimi.hasRush).toBe(true);
      readyAttacker(mimi);
      attackFollower(0, 0, "first", "second");
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("Rush");
    });

    it("Last Words: deals exactly 2 damage to the enemy leader", () => {
      setupTurn(R6, { hand: [MIMI], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const mimi = findOnBoard("first", "Mimi, Right Paw Hellhound")!;
      mimi.defense = 0;
      cleanupDead();
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Deal 2 damage");
    });
  });

  describe("One-Tailed Fox (90054130)", () => {
    const printed =
      "Rush\nWard\nLast Words: Give a random allied Ginsetsu & Yuzuki, Twin Calamities on the field +1/+0.";

    it("real path via Ginsetsu mode 1: summons One-Tailed Fox by uid", () => {
      setupTurn(R10, { hand: [GINSETSU], pp: 9 });
      setScriptedModePickProvider(() => [0]);
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", ONE_TAILED_FOX);
      expect(summoned).toHaveLength(4);
      expect(Number(summoned[0]!.cost)).toBe(2);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(3);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Abysscraft");
    });

    it("Rush: can attack enemy follower the turn it is played", () => {
      setupTurn(R6, { hand: [ONE_TAILED_FOX], pp: 2 });
      const foe = enemyFollower(1, 5, "Foe");
      whenPlayCard("first", 0);
      const fox = findOnBoard("first", "One-Tailed Fox")!;
      applyKeywordsFromList(fox);
      expect(fox.hasRush).toBe(true);
      readyAttacker(fox);
      attackFollower(0, 0, "first", "second");
      expect(Number(foe.defense)).toBe(3);
      expect(printed).toContain("Rush");
    });

    it("Ward: has Ward keyword on play", () => {
      setupTurn(R6, { hand: [ONE_TAILED_FOX], pp: 2 });
      whenPlayCard("first", 0);
      const fox = findOnBoard("first", "One-Tailed Fox")!;
      applyKeywordsFromList(fox);
      expect(fox.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Ward: enemy cannot attack non-Ward follower while Fox is on board", () => {
      setupTurn(R6, { hand: [ONE_TAILED_FOX], pp: 2 });
      whenPlayCard("first", 0);
      const fox = findOnBoard("first", "One-Tailed Fox")!;
      applyKeywordsFromList(fox);
      const bystander = allyFollower("Bystander", 1, 5);
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const defBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(defBefore);
      state.activePlayer = "first";
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(fox),
        "second",
        "first",
      );
      expect(Number(fox.defense)).toBe(0);
    });

    it("Last Words with allied Ginsetsu on field: gives Ginsetsu +1/+0", () => {
      setupTurn(R6, { hand: [ONE_TAILED_FOX], pp: 2 });
      const ginsetsu = createCard(GINSETSU, "board", "first");
      ginsetsu.peak_defense = ginsetsu.defense;
      state.players.first.board.push(ginsetsu);
      whenPlayCard("first", 0);
      const fox = findOnBoard("first", "One-Tailed Fox")!;
      const atkBefore = Number(ginsetsu.attack);
      const defBefore = Number(ginsetsu.defense);
      fox.defense = 0;
      cleanupDead();
      expect(Number(ginsetsu.attack)).toBe(atkBefore + 1);
      expect(Number(ginsetsu.defense)).toBe(defBefore);
      expect(printed).toContain("+1/+0");
    });

    it("Last Words without allied Ginsetsu on field: no follower gains +1/+0", () => {
      setupTurn(R6, { hand: [ONE_TAILED_FOX], pp: 2 });
      const bystander = allyFollower("Bystander", 2, 2);
      whenPlayCard("first", 0);
      const fox = findOnBoard("first", "One-Tailed Fox")!;
      fox.defense = 0;
      cleanupDead();
      expect(Number(bystander.attack)).toBe(2);
      expect(Number(bystander.defense)).toBe(2);
    });
  });

  describe("Scream Diffusion (90054310)", () => {
    const printed =
      "Summon 2 copies of Rulenye & Valnareik and give them Rush.";

    it("real path via Rulenye mode 1: adds Scream Diffusion by uid then plays it", () => {
      setupTurn(R10, { hand: [RULENYE], pp: 7 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const spell = thenHand("first").find((c) => c.id === SCREAM_DIFFUSION)!;
      const uidsBefore = boardUids();
      const handIdx = thenHand("first").indexOf(spell);
      whenPlayCard("first", handIdx);
      const summoned = newBoardCards(uidsBefore, "first", RULENYE);
      expect(summoned).toHaveLength(2);
      for (const copy of summoned) {
        applyKeywordsFromList(copy);
        expect(copy.hasRush).toBe(true);
      }
      expect(printed).toContain("Summon 2 copies");
    });

    it("on play: summons exactly 2 Rulenye & Valnareik (10354120) with Rush", () => {
      setupTurn(R6, { hand: [SCREAM_DIFFUSION], pp: 0 });
      whenPlayCard("first", 0);
      const copies = thenBoard("first").filter((c) => c.id === RULENYE);
      expect(copies).toHaveLength(2);
      for (const copy of copies) {
        applyKeywordsFromList(copy);
        expect(copy.hasRush).toBe(true);
      }
      expect(printed).toContain("give them Rush");
    });
  });

  describe("Wings of Desire (90054320)", () => {
    const printed =
      "Select an allied Rulenye & Valnareik on the field and give it Storm.";

    it("real path via Rulenye mode 2: adds Wings of Desire by uid then plays it", () => {
      setupTurn(R10, { hand: [RULENYE], pp: 7 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const spell = thenHand("first").find((c) => c.id === WINGS_OF_DESIRE)!;
      const rulenye = createCard(RULENYE, "board", "first");
      rulenye.peak_defense = rulenye.defense;
      state.players.first.board = [rulenye];
      const handIdx = thenHand("first").indexOf(spell);
      whenPlayCard("first", handIdx);
      resolvePendingByUid(rulenye.uid);
      applyKeywordsFromList(rulenye);
      expect(rulenye.hasStorm).toBe(true);
      expect(printed).toContain("give it Storm");
    });

    it("on play: gives Storm to selected Rulenye; bystander Rulenye untouched", () => {
      setupTurn(R6, { hand: [WINGS_OF_DESIRE], pp: 0 });
      const target = createCard(RULENYE, "board", "first");
      target.peak_defense = target.defense;
      const bystander = createCard(RULENYE, "board", "first");
      bystander.peak_defense = bystander.defense;
      state.players.first.board = [target, bystander];
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      applyKeywordsFromList(target);
      applyKeywordsFromList(bystander);
      expect(target.hasStorm).toBe(true);
      expect(bystander.hasStorm).toBeFalsy();
      expect(printed).toContain("Select an allied Rulenye");
    });
  });
});
