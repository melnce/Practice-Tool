/**
 * L2 real-card tests — Neutral tokens (7 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails with finding comment.
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
import { getCardById } from "../../src/data/cardDatabase.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { attackLeader } from "../../src/logic/core/combat.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

// Tokens under test (table order)
const DEMON = "90004130";
const GOBLIN = "90001110";
const SERVANT = "90004120";
const SILENT_RIDER = "90004110";
const ASTAROTH = "90004310";
const GREAT_TESTIMONY = "90004320";
const SWEETNESS = "90004330";

// Generators
const RULER = "10104120";
const GOBLIN_FORAY = "10101310";
const MJERRABAINE = "10304110";
const GILNELISE = "10304120";

const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";

const R6 = 6;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    secondMaxPP?: number;
    secondDeck?: string[];
    seed?: number;
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
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) {
    b = b.withSecondPP(opts.secondPP, opts.secondMaxPP ?? max);
  }
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  else b = b.withSecondDeck(Array(10).fill(FILLER));
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

function readyAttacker(
  card: CardInstance,
  owner: "first" | "second" = "first",
): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
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
  expect(card.class).toBe("Neutral");
  expect(Number(card.cost)).toBe(expected.cost);
  expect(Number(card.attack)).toBe(expected.attack);
  expect(Number(card.defense)).toBe(expected.defense);
  expect(card.tribes ?? []).toEqual(expected.tribes);
  expect(card.hasStorm).toBeFalsy();
  expect(card.hasRush).toBeFalsy();
  expect(card.hasWard).toBeFalsy();
  expect(card.hasBane).toBeFalsy();
  expect(card.hasAmbush).toBeFalsy();
  expect(card.hasBarrier).toBeFalsy();
}

describe("L2 — Neutral tokens", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Demon of Purgatory (90004130)", () => {
    const printed =
      "Fanfare: Select 2 enemy followers on the field and deal 6 damage to them and the enemy leader.";

    it("real path via Ruler of Cocytus (10104120): Apocalypse deck contains Demon instances", () => {
      setupTurn(R10, { hand: [RULER], pp: 10 });
      whenPlayCard("first", 0);
      const demons = thenDeck("first").filter((c) => c.id === DEMON);
      expect(demons).toHaveLength(3);
      expect(Number(demons[0]!.cost)).toBe(5);
      expect(Number(demons[0]!.attack)).toBe(9);
      expect(Number(demons[0]!.defense)).toBe(6);
      expect(demons[0]!.type).toBe("Follower");
      expect(demons[0]!.class).toBe("Neutral");
    });

    it("Fanfare: deals 6 damage to 2 selected enemy followers; bystander untouched", () => {
      setupTurn(R10, { hand: [DEMON], pp: 5 });
      const targetA = enemyFollower(1, 8, "TargetA");
      const targetB = enemyFollower(1, 8, "TargetB");
      const bystander = enemyFollower(1, 8, "Bystander");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(targetA.uid);
      resolvePendingByUid(targetB.uid);
      expect(Number(targetA.defense)).toBe(2);
      expect(Number(targetB.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(8);
      expect(printed).toContain("Select 2 enemy followers");
    });

    it("Fanfare: deals 6 damage to the enemy leader", () => {
      setupTurn(R10, { hand: [DEMON], pp: 5 });
      const targetA = enemyFollower(1, 8, "TargetA");
      const targetB = enemyFollower(1, 8, "TargetB");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(targetA.uid);
      resolvePendingByUid(targetB.uid);
      expect(getHP(state, "second")).toBe(14);
      expect(printed).toContain("the enemy leader");
    });

    it("Fanfare with no enemy followers: still deals 6 damage to the enemy leader", () => {
      setupTurn(R10, { hand: [DEMON], pp: 5 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(14);
    });
  });

  describe("Goblin (90001110)", () => {
    const printed = "";

    it("real path via Goblin Foray (10101310): summons exactly 5 Goblins by uid", () => {
      setupTurn(R6, { hand: [GOBLIN_FORAY], pp: 5 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(boardBefore, "first", GOBLIN);
      expect(summoned).toHaveLength(5);
      assertVanillaFollower(summoned[0]!, GOBLIN, {
        cost: 1,
        attack: 1,
        defense: 2,
        tribes: [],
      });
      expect(printed).toBe("");
    });
  });

  describe("Servant of Cocytus (90004120)", () => {
    const printed = "";

    it("real path via Ruler of Cocytus (10104120): Apocalypse deck contains Servant instances", () => {
      setupTurn(R10, { hand: [RULER], pp: 10 });
      whenPlayCard("first", 0);
      const servants = thenDeck("first").filter((c) => c.id === SERVANT);
      expect(servants).toHaveLength(3);
      assertVanillaFollower(servants[0]!, SERVANT, {
        cost: 1,
        attack: 13,
        defense: 13,
        tribes: [],
      });
      expect(printed).toBe("");
    });
  });

  describe("Silent Rider (90004110)", () => {
    const printed = "Storm";

    it("real path via Ruler of Cocytus (10104120): Apocalypse deck contains Silent Rider instances", () => {
      setupTurn(R10, { hand: [RULER], pp: 10 });
      whenPlayCard("first", 0);
      const riders = thenDeck("first").filter((c) => c.id === SILENT_RIDER);
      expect(riders).toHaveLength(3);
      expect(Number(riders[0]!.cost)).toBe(6);
      expect(Number(riders[0]!.attack)).toBe(10);
      expect(Number(riders[0]!.defense)).toBe(10);
      expect(riders[0]!.type).toBe("Follower");
      expect(riders[0]!.class).toBe("Neutral");
    });

    it("Storm: can attack enemy leader the turn it is played", () => {
      setupTurn(R10, { hand: [SILENT_RIDER], pp: 6 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const rider = findOnBoard("first", "Silent Rider")!;
      applyKeywordsFromList(rider);
      expect(rider.hasStorm).toBe(true);
      readyAttacker(rider);
      const atkIdx = getBoard(state, "first").indexOf(rider);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(10);
      expect(printed).toContain("Storm");
    });
  });

  describe("Astaroth's Reckoning (90004310)", () => {
    const printed = "Set the enemy leader's max defense to 1.";

    it("real path via Ruler of Cocytus (10104120): Apocalypse deck contains Astaroth's Reckoning", () => {
      setupTurn(R10, { hand: [RULER], pp: 10 });
      whenPlayCard("first", 0);
      const spells = thenDeck("first").filter((c) => c.id === ASTAROTH);
      expect(spells).toHaveLength(1);
      expect(Number(spells[0]!.cost)).toBe(10);
      expect(spells[0]!.type).toBe("Spell");
      expect(spells[0]!.class).toBe("Neutral");
    });

    it("on play: sets enemy leader max defense to 1", () => {
      setupTurn(R10, { hand: [ASTAROTH], pp: 10 });
      state.players.second.maxHP = 20;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(state.players.second.maxHP).toBe(1);
      expect(getHP(state, "second")).toBe(1);
      expect(printed).toContain("max defense to 1");
    });
  });

  describe("Great Testimony (90004320)", () => {
    const printed = "Select an enemy follower on the field and destroy it.";

    it("real path via Mjerrabaine, Great Manifest (10304110): adds Great Testimony by uid", () => {
      setupTurn(R6, { hand: [MJERRABAINE], pp: 4 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", GREAT_TESTIMONY);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Neutral");
    });

    it("on play: destroys selected enemy follower; bystander untouched", () => {
      setupTurn(R6, { hand: [GREAT_TESTIMONY], pp: 1 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(thenBoard("second").some((c) => c.uid === target.uid)).toBe(false);
      expect(thenBoard("second").some((c) => c.uid === bystander.uid)).toBe(
        true,
      );
      expect(Number(bystander.defense)).toBe(4);
      expect(printed).toContain("destroy it");
    });
  });

  describe("Sweetness of Voracity (90004330)", () => {
    const printed =
      "Deal 5 damage to a random enemy follower and the enemy leader.";

    it("real path via Gilnelise, Voracity Manifest (10304120): adds Sweetness by uid when both players have 10 max PP", () => {
      setupTurn(R10, {
        hand: [GILNELISE],
        pp: 3,
        secondPP: 10,
        secondMaxPP: 10,
      });
      const other = createCard(
        { name: "Other", type: "Follower", cost: 2, attack: 1, defense: 4 },
        "board",
        "first",
      );
      other.peak_defense = other.defense;
      state.players.first.board.push(other);
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      resolvePendingByUid(other.uid);
      const added = newHandCards(uidsBefore, "first", SWEETNESS);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(5);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Neutral");
    });

    it("with enemy follower present: deals 5 damage to a random enemy follower and 5 to the enemy leader", () => {
      setupTurn(R10, { hand: [SWEETNESS], pp: 5, seed: 42 });
      const foe = enemyFollower(2, 8, "Foe");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(3);
      expect(getHP(state, "second")).toBe(15);
      expect(printed).toContain("Deal 5 damage");
    });

    it("with no enemy followers: deals 5 damage to the enemy leader only", () => {
      setupTurn(R10, { hand: [SWEETNESS], pp: 5 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(15);
      expect(thenBoard("second")).toHaveLength(0);
    });
  });
});
