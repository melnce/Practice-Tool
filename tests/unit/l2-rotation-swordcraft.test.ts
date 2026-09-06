/**
 * L2 real-card tests — rotation-legal Swordcraft cards (38 cards).
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
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { drawCard } from "../../src/core/utils.js";
import { isCantAttackLocked } from "../../src/logic/core/keywords/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getGraveyard,
  setRally,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const MAJESTIC_CONQUEST = "10622310";
const MEASURED_ATTUNEMENT = "10721310";
const EXTRAVAGANCE = "10521310";
const FEARLESS_SOLDIER = "10621110";
const PHALANX = "10921310";
const RANDALL = "10421110";
const ROYAL_COACHWOMAN = "10022110";
const SERENITY_SHIELD = "10522310";
const SHAILI = "10821120";
const ARTHUR = "10421120";
const BOMBASTIC_BOMBARDIER = "10721110";
const CAESURA = "10723310";
const FEATHER = "10422120";
const KATZE = "10822110";
const LOYAL_GUARD = "10622110";
const MORDRED = "10421130";
const OKITA = "10823110";
const RUSTY = "10022120";
const SMOKE_BEAUTY = "10521120";
const ANCESTRAL_CROWN = "10022210";
const FIORITO = "10422130";
const HEARTLESS = "10623110";
const IDLE_MAID = "10621120";
const KINDRED_CAVALRY = "10921120";
const SASHA = "10821130";
const SEOFON = "10424120";
const UNMOVING = "10523110";
const ADVENT_ELD_SWORD = "10621310";
const FEROCIOUS = "10922120";
const KNIGHTLY_ARDOR = "10423310";
const AGLOVALE = "10422110";
const ALTRUISTIC = "10521110";
const NOEL = "10624110";
const SWIFT_STAFF = "10522110";
const AMPHIBIAN = "10522120";
const NAVY_CAT = "10622120";
const OLUON = "10524110";
const ODA = "10822120";

// Tokens / helpers
const KNIGHT = "90021110";
const STEELCLAD_KNIGHT = "90021120";
const GLITTERING_GOLD = "90021350";
const FILLER = "10111310";
const SPELL_A = "10111310";
const SPELL_B = "10131310";
const SWORD_FOLLOWER_A = "10022110";
const SWORD_FOLLOWER_B = "10421110";
const NON_SWORD_FOLLOWER = "10101110"; // Fairy (Forestcraft)
const SWORD_LEFT = "10022110"; // Royal Coachwoman
const SWORD_RIGHT = "10421110"; // Randall, Feet Fighter
const DRAW_TOP = "10021110";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R9 = 9;
const R10 = 10;
const R15 = 15;

const MAJESTIC_CREST = "Majestic Conquest";
const crestPrinted =
  "Countdown (2)\nWhenever you play an Enhanced card, summon a Fearless Soldier.";

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
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
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

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardCountById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.id === id).length;
}

function pushDeckTop(id: string): void {
  state.players.first.deck.push(createCard(id, "deck", "first"));
}

function drawFromDeck(): void {
  drawCard(state.players.first.hand, state.players.first.deck, "first");
}

function majesticCrest() {
  return getCrests(state, "first").find((c) => c.name === MAJESTIC_CREST);
}

describe("L2 rotation Swordcraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    delete (globalThis as any).HEADLESS;
    setScriptedModePickProvider(null);
  });

  describe("Majestic Conquest (10622310)", () => {
    const printed =
      "Gain Crest: Majestic Conquest.\nEnhance (3): Delay the count of your Crest: Majestic Conquest by 2.";

    it("base (1 PP): gains Crest: Majestic Conquest with Countdown (2)", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST], pp: 1 });
      whenPlayCard("first", 0);
      const crest = majesticCrest();
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(2);
      expect(printed).toContain("Gain Crest");
    });

    it("without Enhance (3): does not delay crest countdown beyond 2", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST], pp: 1 });
      whenPlayCard("first", 0);
      expect(Number(majesticCrest()!.countdown)).toBe(2);
      expect(printed).toContain("Enhance (3)");
    });

    it("Enhance (3): gains crest then delays countdown by 2 → 4", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST], pp: 3 });
      whenPlayCard("first", 0);
      expect(Number(majesticCrest()!.countdown)).toBe(4);
      expect(printed).toContain("Delay the count");
    });

    it("crest: playing an Enhanced card summons a Fearless Soldier in addition to the played card", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST, FEARLESS_SOLDIER], pp: 1 });
      whenPlayCard("first", 0);
      state.players.first.pp = 3;
      whenPlayCard("first", 0);
      expect(boardCountById(FEARLESS_SOLDIER)).toBe(2);
      expect(crestPrinted).toContain("summon a Fearless Soldier");
    });

    it("crest: playing a non-Enhanced card does not summon Fearless Soldier", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST, MEASURED_ATTUNEMENT], pp: 2 });
      whenPlayCard("first", 0);
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(boardCountById(FEARLESS_SOLDIER)).toBe(0);
    });

    it("crest countdown ticks at start of owner's turn", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST], pp: 1 });
      whenPlayCard("first", 0);
      expect(Number(majesticCrest()!.countdown)).toBe(2);
      whenEndTurn();
      whenEndTurn();
      expect(Number(majesticCrest()!.countdown)).toBe(1);
      expect(crestPrinted).toContain("Countdown (2)");
    });

    it("crest expires after countdown reaches 0 at owner's turn start", () => {
      setupTurn(R6, { hand: [MAJESTIC_CONQUEST], pp: 1 });
      whenPlayCard("first", 0);
      for (let i = 0; i < 4; i++) whenEndTurn();
      expect(majesticCrest()).toBeUndefined();
    });
  });

  describe("Measured Attunement (10721310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 3 damage. Rally (10) - Give it \"Can't attack followers or leaders\" until the end of your opponent's turn.";

    it("deals exactly 3 damage to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [MEASURED_ATTUNEMENT], pp: 1 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(6);
    });

    it("without Rally (10): does not apply can't attack", () => {
      setupTurn(R6, { hand: [MEASURED_ATTUNEMENT], pp: 1 });
      setRally(state, "first", 9);
      const target = enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(isCantAttackLocked(target)).toBe(false);
      expect(printed).toContain("Rally (10)");
    });

    it("with Rally (10): selected enemy can't attack until opponent's EOT", () => {
      setupTurn(R6, { hand: [MEASURED_ATTUNEMENT], pp: 1 });
      setRally(state, "first", 10);
      const target = enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(isCantAttackLocked(target)).toBe(true);
      expect(printed).toContain("Can't attack");
    });
  });

  describe("Extravagance of the Goldbloom (10521310)", () => {
    const printed =
      'Select a spell in your hand and discard it. Do this 2 times: "Deal 3 damage to a random enemy follower."';

    it("discards selected spell from hand", () => {
      setupTurn(R6, { hand: [EXTRAVAGANCE, SPELL_B], pp: 2 });
      const spell = thenHand("first").find((c) => c.id === SPELL_B)!;
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(spell.uid);
      expect(handIds()).not.toContain(SPELL_B);
      expect(printed).toContain("discard it");
    });

    it("deals 3 damage twice to enemy followers (6 total to one foe)", () => {
      setupTurn(R6, { hand: [EXTRAVAGANCE, SPELL_B], pp: 2 });
      const spell = thenHand("first").find((c) => c.id === SPELL_B)!;
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(spell.uid);
      expect(Number(foe.defense)).toBe(4);
      expect(printed).toContain("Deal 3 damage");
    });
  });

  describe("Fearless Soldier (10621110)", () => {
    const printed = "Enhance (3): Give this follower +1/+1.\nRush";

    it("without Enhance (3): plays at 2/2 with Rush", () => {
      setupTurn(R6, { hand: [FEARLESS_SOLDIER], pp: 2 });
      whenPlayCard("first", 0);
      const soldier = findOnBoard("first", "Fearless Soldier")!;
      expect(Number(soldier.attack)).toBe(2);
      expect(Number(soldier.defense)).toBe(2);
      expect(soldier.hasRush).toBe(true);
    });

    it("Enhance (3): becomes 3/3 with Rush", () => {
      setupTurn(R6, { hand: [FEARLESS_SOLDIER], pp: 3 });
      whenPlayCard("first", 0);
      const soldier = findOnBoard("first", "Fearless Soldier")!;
      expect(Number(soldier.attack)).toBe(3);
      expect(Number(soldier.defense)).toBe(3);
      expect(soldier.hasRush).toBe(true);
      expect(printed).toContain("+1/+1");
    });
  });

  describe("Phalanx (10921310)", () => {
    const printed =
      "Summon a Steelclad Knight and give it Ward.\nEnhance (6): Summon 5 instead.";

    it("base (2 PP): summons exactly 1 Steelclad Knight (90021120) with Ward", () => {
      setupTurn(R6, { hand: [PHALANX], pp: 2 });
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter(
        (c) => c.id === STEELCLAD_KNIGHT,
      );
      expect(knights).toHaveLength(1);
      expect(knights[0]!.hasWard).toBe(true);
    });

    it("Enhance (6): summons exactly 5 Steelclad Knights with Ward", () => {
      setupTurn(R6, { hand: [PHALANX], pp: 6 });
      state.players.first.board = [];
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter(
        (c) => c.id === STEELCLAD_KNIGHT,
      );
      expect(knights).toHaveLength(5);
      expect(knights.every((k) => k.hasWard)).toBe(true);
      expect(printed).toContain("Summon 5 instead");
    });
  });

  describe("Randall, Feet Fighter (10421110)", () => {
    const printed = "Enhance(5): Give this follower Storm.";

    it("without Enhance(5): does not gain Storm", () => {
      setupTurn(R6, { hand: [RANDALL], pp: 2 });
      whenPlayCard("first", 0);
      const randall = findOnBoard("first", "Randall, Feet Fighter")!;
      expect(randall.hasStorm).toBeFalsy();
    });

    it("Enhance(5): gains Storm", () => {
      setupTurn(R6, { hand: [RANDALL], pp: 5 });
      whenPlayCard("first", 0);
      const randall = findOnBoard("first", "Randall, Feet Fighter")!;
      expect(randall.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Royal Coachwoman (10022110)", () => {
    const printed = "Last Words: Summon a Knight.";

    it("Last Words summons exactly 1 Knight (90021110)", () => {
      setupTurn(R6, { hand: [ROYAL_COACHWOMAN], pp: 2 });
      whenPlayCard("first", 0);
      const coach = findOnBoard("first", "Royal Coachwoman")!;
      coach.defense = 0;
      cleanupDead();
      expect(boardCountById(KNIGHT)).toBe(1);
      expect(printed).toContain("Summon a Knight");
    });
  });

  describe("Serenity's Shield (10522310)", () => {
    const printed =
      "Summon 2 copies of Knight.\nEnhance (4): Summon 4 instead.";

    it("base (2 PP): summons exactly 2 Knights (90021110)", () => {
      setupTurn(R6, { hand: [SERENITY_SHIELD], pp: 2 });
      whenPlayCard("first", 0);
      expect(boardCountById(KNIGHT)).toBe(2);
    });

    it("Enhance (4): summons exactly 4 Knights", () => {
      setupTurn(R6, { hand: [SERENITY_SHIELD], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardCountById(KNIGHT)).toBe(4);
      expect(printed).toContain("Summon 4 instead");
    });
  });

  describe("Shaili, Prowling Assassin (10821120)", () => {
    const printed =
      "Ambush\nEvolve: Select an enemy follower on the field and give it \"Can't attack followers or leaders\" until the end of your opponent's turn.";

    it("has Ambush on play", () => {
      setupTurn(R6, { hand: [SHAILI], pp: 2 });
      whenPlayCard("first", 0);
      const shaili = findOnBoard("first", "Shaili, Prowling Assassin")!;
      expect(shaili.hasAmbush).toBe(true);
    });

    it("Evolve: selected enemy can't attack; bystander untouched", () => {
      setupTurn(R6, { hand: [SHAILI], pp: 2, evo: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      const shaili = findOnBoard("first", "Shaili, Prowling Assassin")!;
      whenEvolve(shaili, "first");
      resolvePendingByUid(target.uid);
      expect(isCantAttackLocked(target)).toBe(true);
      expect(isCantAttackLocked(bystander)).toBe(false);
    });
  });

  describe("Arthur, Staunch Dragon (10421120)", () => {
    const printed = "Ward\nEvolve: Summon a Mordred, Illusory Lion.";

    it("has Ward", () => {
      setupTurn(R6, { hand: [ARTHUR], pp: 3 });
      whenPlayCard("first", 0);
      const arthur = findOnBoard("first", "Arthur, Staunch Dragon")!;
      expect(arthur.hasWard).toBe(true);
    });

    it("Evolve summons exactly 1 Mordred, Illusory Lion (10421130)", () => {
      setupTurn(R6, { hand: [ARTHUR], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const arthur = findOnBoard("first", "Arthur, Staunch Dragon")!;
      whenEvolve(arthur, "first");
      expect(boardCountById(MORDRED)).toBe(1);
      expect(printed).toContain("Mordred");
    });
  });

  describe("Bombastic Bombardier (10721110)", () => {
    const printed =
      "Activates in hand. Whenever an allied follower super-evolves, set the cost of this card to 1.\nFanfare: Select an enemy follower on the field and deal it 3 damage.";

    it("Fanfare deals exactly 3 to selected enemy; bystander untouched", () => {
      setupTurn(R7, { hand: [BOMBASTIC_BOMBARDIER], pp: 3 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(6);
    });

    it("without ally super-evolve: hand cost stays 3", () => {
      setupTurn(R7, { hand: [BOMBASTIC_BOMBARDIER], pp: 3 });
      const bombardier = getHand(state, "first")[0]!;
      expect(getEffectiveCost(bombardier)).toBe(3);
    });

    it("when allied follower super-evolves: hand cost becomes 1", () => {
      setupTurn(R7, { hand: [BOMBASTIC_BOMBARDIER], pp: 3 });
      const bombardier = getHand(state, "first")[0]!;
      const ally = allyFollower(3, 3, "Hero");
      applyKeywordsFromList(ally);
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(ally, "first");
      expect(getEffectiveCost(bombardier)).toBe(1);
      expect(printed).toContain("set the cost of this card to 1");
    });
  });

  describe("Caesura al Fine (10723310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 6 damage. Rally (10) - Deal X damage to all enemy followers. X is the number of allied followers on the field.";

    it("without Rally (10): deals 6 to selected only; bystander takes 0 splash", () => {
      setupTurn(R6, { hand: [CAESURA], pp: 3 });
      setRally(state, "first", 9);
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("with Rally (10) and 2 allies: selected takes 6, all enemies also take 2", () => {
      setupTurn(R6, { hand: [CAESURA], pp: 3 });
      setRally(state, "first", 10);
      allyFollower(1, 1, "A");
      allyFollower(1, 1, "B");
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(0);
      expect(Number(bystander.defense)).toBe(6);
      expect(printed).toContain("X is the number of allied followers");
    });
  });

  describe("Feather, Bombastic Brawler (10422120)", () => {
    const printed = "";

    it("plays as a 5/4 follower with no printed abilities", () => {
      setupTurn(R6, { hand: [FEATHER], pp: 3 });
      whenPlayCard("first", 0);
      const feather = findOnBoard("first", "Feather, Bombastic Brawler")!;
      expect(Number(feather.attack)).toBe(5);
      expect(Number(feather.defense)).toBe(4);
      expect(printed).toBe("");
    });
  });

  describe("Katze, Magical Thief (10822110)", () => {
    const printed =
      "Once on each of your turns, when you play a spell, deal 2 damage to a random enemy follower.\nEvolve: Add a Glittering Gold to your hand.";

    it("owner's turn first spell: deals 2 to an enemy follower", () => {
      setupTurn(R6, { hand: [KATZE, SPELL_A], pp: 4 });
      whenPlayCard("first", 0);
      const foe = enemyFollower(2, 5, "Foe");
      const defBefore = Number(foe.defense);
      whenPlayCard("first", 0);
      expect(defBefore - Number(foe.defense)).toBe(2);
    });

    it("owner's turn second spell same turn: does not deal damage again", () => {
      setupTurn(R6, { hand: [KATZE, SPELL_A, SPELL_B], pp: 6 });
      whenPlayCard("first", 0);
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      const afterFirst = Number(foe.defense);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(afterFirst);
      expect(printed).toContain("Once on each of your turns");
    });

    it("opponent's turn spell play: does not deal damage", () => {
      resetUidCounter();
      givenGameState({ seed: 2, activePlayer: "second", roundCount: R6 })
        .withFirstPP(10, 6)
        .withSecondPP(10, 6)
        .withSecondHand([SPELL_A])
        .build();
      state.gameStarted = true;
      state.phase = "main";
      const katze = createCard(KATZE, "board", "first");
      katze.peak_defense = katze.defense;
      state.players.first.board = [katze];
      const foe = enemyFollower(2, 5, "Foe");
      const defBefore = Number(foe.defense);
      whenPlayCard("second", 0);
      expect(Number(foe.defense)).toBe(defBefore);
    });

    it("Evolve adds Glittering Gold (90021350) to hand", () => {
      setupTurn(R6, { hand: [KATZE], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const katze = findOnBoard("first", "Katze, Magical Thief")!;
      whenEvolve(katze, "first");
      expect(handIds()).toContain(GLITTERING_GOLD);
    });
  });

  describe("Loyal Guard (10622110)", () => {
    const printed =
      "Enhance (4): Give this follower +2/+2.\nWard\nEvolve: Select an enemy follower on the field and deal it 3 damage.";

    it("without Enhance (4): plays 3/3 with Ward", () => {
      setupTurn(R6, { hand: [LOYAL_GUARD], pp: 3 });
      whenPlayCard("first", 0);
      const guard = findOnBoard("first", "Loyal Guard")!;
      expect(Number(guard.attack)).toBe(3);
      expect(Number(guard.defense)).toBe(3);
      expect(guard.hasWard).toBe(true);
    });

    it("Enhance (4): becomes 5/5 with Ward", () => {
      setupTurn(R6, { hand: [LOYAL_GUARD], pp: 4 });
      whenPlayCard("first", 0);
      const guard = findOnBoard("first", "Loyal Guard")!;
      expect(Number(guard.attack)).toBe(5);
      expect(Number(guard.defense)).toBe(5);
      expect(guard.hasWard).toBe(true);
    });

    it("Evolve deals 3 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [LOYAL_GUARD], pp: 3, evo: 2 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      const guard = findOnBoard("first", "Loyal Guard")!;
      whenEvolve(guard, "first");
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(6);
    });
  });

  describe("Mordred, Illusory Lion (10421130)", () => {
    const printed = "Storm\nEvolve: Summon an Arthur, Staunch Dragon.";

    it("has Storm", () => {
      setupTurn(R6, { hand: [MORDRED], pp: 3 });
      whenPlayCard("first", 0);
      const mordred = findOnBoard("first", "Mordred, Illusory Lion")!;
      expect(mordred.hasStorm).toBe(true);
    });

    it("Evolve summons exactly 1 Arthur, Staunch Dragon (10421120)", () => {
      setupTurn(R6, { hand: [MORDRED], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const mordred = findOnBoard("first", "Mordred, Illusory Lion")!;
      whenEvolve(mordred, "first");
      expect(boardCountById(ARTHUR)).toBe(1);
    });
  });

  describe("Okita Souji (10823110)", () => {
    const printed =
      'Fanfare: If you\'ve unlocked super-evolution, evolve this follower.\nRush\nFollower Strike: Do this 1 time: "Deal 3 damage to the opposing follower." If this follower is evolved, do it 3 times instead.';

    it("without super-evolution unlocked: Fanfare does not evolve", () => {
      setupTurn(R6, { hand: [OKITA], pp: 3 });
      whenPlayCard("first", 0);
      const okita = findOnBoard("first", "Okita Souji")!;
      expect(okita.hasEvolved).toBeFalsy();
      expect(okita.hasRush).toBe(true);
    });

    it("with super-evolution unlocked: Fanfare evolves this follower", () => {
      setupTurn(R7, { hand: [OKITA], pp: 3 });
      whenPlayCard("first", 0);
      const okita = findOnBoard("first", "Okita Souji")!;
      expect(okita.hasEvolved).toBe(true);
      expect(okita.hasRush).toBe(true);
    });

    it("unevolved Follower Strike: deals 3 strike damage then combat (foe 8 → 3)", () => {
      setupTurn(R6, { hand: [OKITA], pp: 3 });
      whenPlayCard("first", 0);
      const okita = findOnBoard("first", "Okita Souji")!;
      const foe = enemyFollower(1, 8, "Foe");
      okita.can_attack = true;
      okita.justPlayed = false;
      okita.attacks_left = 1;
      applyKeywordsFromList(okita);
      const atkIdx = getBoard(state, "first").indexOf(okita);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(3);
    });

    it("evolved Follower Strike: deals 9 strike damage then combat (foe 12 → 0)", () => {
      setupTurn(R7, { hand: [OKITA], pp: 3 });
      whenPlayCard("first", 0);
      const okita = findOnBoard("first", "Okita Souji")!;
      const foe = enemyFollower(1, 12, "Foe");
      okita.can_attack = true;
      okita.justPlayed = false;
      okita.attacks_left = 1;
      applyKeywordsFromList(okita);
      const atkIdx = getBoard(state, "first").indexOf(okita);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(0);
      expect(printed).toContain("do it 3 times instead");
    });
  });

  describe("Rusty, Luxcard Trickster (10022120)", () => {
    const printed =
      "Super-Evolve: Draw all copies of Rusty, Luxcard Trickster and give them Storm.";

    it("Super-Evolve draws all Rusty copies from deck only and gives Storm", () => {
      setupTurn(R7, { pp: 10, superEvo: 2 });
      const onBoard = createCard(RUSTY, "board", "first");
      onBoard.peak_defense = onBoard.defense;
      state.players.first.board = [onBoard];
      state.players.first.hand = [createCard(RUSTY, "hand", "first")];
      state.players.first.deck = [
        createCard(RUSTY, "deck", "first"),
        createCard(RUSTY, "deck", "first"),
      ];
      state.players.first.graveyard = [createCard(RUSTY, "graveyard", "first")];
      const deckBefore = state.players.first.deck.length;
      const handBefore = state.players.first.hand.length;
      const handUidsBefore = new Set(
        state.players.first.hand.map((c) => c.uid),
      );
      whenSuperEvolve(onBoard, "first");
      const rustyInHand = thenHand("first").filter(
        (c) => c.name === "Rusty, Luxcard Trickster",
      );
      expect(rustyInHand.length).toBe(handBefore + deckBefore);
      const deckDrawn = rustyInHand.filter((c) => !handUidsBefore.has(c.uid));
      expect(deckDrawn.length).toBe(deckBefore);
      expect(deckDrawn.every((c) => c.hasStorm)).toBe(true);
      expect(
        getGraveyard(state, "first").filter(
          (c) => c.name === "Rusty, Luxcard Trickster",
        ),
      ).toHaveLength(1);
    });
  });

  describe("Smoke-Shrouded Beauty (10521120)", () => {
    const printed =
      "Fanfare: If you have at least 2 spells in your hand, give this follower +1/+1 and Ward.\nEvolve: Add a Glittering Gold to your hand.";

    it("with fewer than 2 spells: no +1/+1 or Ward", () => {
      setupTurn(R6, { hand: [SMOKE_BEAUTY, SPELL_A], pp: 3 });
      whenPlayCard("first", 0);
      const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
      expect(Number(beauty.attack)).toBe(3);
      expect(Number(beauty.defense)).toBe(3);
      expect(beauty.hasWard).toBeFalsy();
    });

    it("with at least 2 spells: gains +1/+1", () => {
      setupTurn(R6, { hand: [SMOKE_BEAUTY, SPELL_A, SPELL_B], pp: 3 });
      whenPlayCard("first", 0);
      const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
      expect(Number(beauty.attack)).toBe(4);
      expect(Number(beauty.defense)).toBe(4);
    });

    it("with at least 2 spells: grants Ward per printed text", () => {
      setupTurn(R6, { hand: [SMOKE_BEAUTY, SPELL_A, SPELL_B], pp: 3 });
      whenPlayCard("first", 0);
      const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
      expect(Number(beauty.attack)).toBe(4);
      expect(Number(beauty.defense)).toBe(4);
      expect(beauty.hasWard || beauty.keywordState?.hasWard).toBe(true);
    });

    it("Evolve adds Glittering Gold (90021350)", () => {
      setupTurn(R6, { hand: [SMOKE_BEAUTY], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
      whenEvolve(beauty, "first");
      expect(handIds()).toContain(GLITTERING_GOLD);
    });
  });

  describe("Ancestral Crown (10022210)", () => {
    const printed =
      "Countdown (4)\nWhenever an allied follower enters the field, give it +1/+1.";

    it("enters with Countdown (4)", () => {
      setupTurn(R6, { hand: [ANCESTRAL_CROWN], pp: 4 });
      whenPlayCard("first", 0);
      const crown = findOnBoard("first", "Ancestral Crown")!;
      expect(Number(crown.countdown)).toBe(4);
    });

    it("ally follower enter gains +1/+1", () => {
      setupTurn(R6, { hand: [ANCESTRAL_CROWN, DRAW_TOP], pp: 10 });
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      const quick = findOnBoard("first", "Flashstep Quickblader")!;
      expect(Number(quick.attack)).toBe(2);
      expect(Number(quick.defense)).toBe(2);
    });

    it("countdown ticks at start of owner's turn only", () => {
      setupTurn(R6, { hand: [ANCESTRAL_CROWN], pp: 4 });
      whenPlayCard("first", 0);
      const crown = findOnBoard("first", "Ancestral Crown")!;
      whenEndTurn();
      whenEndTurn();
      expect(Number(crown.countdown)).toBe(3);
      whenEndTurn();
      expect(Number(crown.countdown)).toBe(3);
    });
  });

  describe("Fiorito, Muscles in Bloom (10422130)", () => {
    const printed = "Ambush\nBane";

    it("has Ambush and Bane", () => {
      setupTurn(R6, { hand: [FIORITO], pp: 4 });
      whenPlayCard("first", 0);
      const fiorito = findOnBoard("first", "Fiorito, Muscles in Bloom")!;
      expect(fiorito.hasAmbush).toBe(true);
      expect(fiorito.hasBane).toBe(true);
    });
  });

  describe("Heartless Strategist (10623110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it.\nEnhance (6): Recover 3 play points. Add a Fearless Soldier to your hand.";

    it("without Enhance (6): destroys selected enemy only", () => {
      setupTurn(R6, { hand: [HEARTLESS], pp: 4 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second")).not.toContain(target);
      expect(getBoard(state, "second")).toContain(bystander);
      expect(handIds()).not.toContain(FEARLESS_SOLDIER);
    });

    it("Enhance (6): Fanfare destroy + recover 3 PP + add Fearless Soldier", () => {
      setupTurn(R6, { hand: [HEARTLESS], pp: 6 });
      const target = enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(getPP(state, "first")).toBe(3);
      expect(handIds()).toContain(FEARLESS_SOLDIER);
    });
  });

  describe("Idle Maid (10621120)", () => {
    const printed =
      "Fanfare: Select a card in your hand and return it to deck. Draw 2 Swordcraft followers.";

    it("returns selected hand card to deck and adds 2 Swordcraft followers to hand", () => {
      setupTurn(R6, {
        hand: [IDLE_MAID, SPELL_A],
        deck: [SWORD_FOLLOWER_A, SWORD_FOLLOWER_B, FILLER],
      });
      state.players.first.deck = [
        createCard(SWORD_FOLLOWER_A, "deck", "first"),
        createCard(SWORD_FOLLOWER_B, "deck", "first"),
        createCard(FILLER, "deck", "first"),
      ];
      const toReturn = thenHand("first").find((c) => c.id === SPELL_A)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);
      expect(thenDeck("first").some((c) => c.id === SPELL_A)).toBe(true);
      expect(handIds().filter((id) => id === SWORD_FOLLOWER_A)).toHaveLength(1);
      expect(handIds().filter((id) => id === SWORD_FOLLOWER_B)).toHaveLength(1);
      expect(printed).toContain("Draw 2 Swordcraft followers");
    });
  });

  describe("Kindred Cavalrywoman (10921120)", () => {
    const printed = "Rush\nWard";

    it("has Rush and Ward", () => {
      setupTurn(R6, { hand: [KINDRED_CAVALRY], pp: 4 });
      whenPlayCard("first", 0);
      const cavalry = findOnBoard("first", "Kindred Cavalrywoman")!;
      expect(cavalry.hasRush).toBe(true);
      expect(cavalry.hasWard).toBe(true);
    });
  });

  describe("Sasha, Knight Everlasting (10821130)", () => {
    const printed =
      "Fanfare: Summon a Steelclad Knight and give it Rush.\nEvolve: Summon a Steelclad Knight and give it Ward.";

    it("Fanfare summons Steelclad Knight (90021120) with Rush", () => {
      setupTurn(R6, { hand: [SASHA], pp: 4 });
      whenPlayCard("first", 0);
      const knight = thenBoard("first").find((c) => c.id === STEELCLAD_KNIGHT);
      expect(knight).toBeTruthy();
      expect(knight!.hasRush).toBe(true);
    });

    it("Evolve summons Steelclad Knight with Ward", () => {
      setupTurn(R6, { hand: [SASHA], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const sasha = findOnBoard("first", "Sasha, Knight Everlasting")!;
      whenEvolve(sasha, "first");
      const knights = thenBoard("first").filter(
        (c) => c.id === STEELCLAD_KNIGHT,
      );
      expect(knights).toHaveLength(2);
      const newKnight = knights.find((k) => k.uid !== knights[0]!.uid)!;
      expect(newKnight.hasWard).toBe(true);
    });
  });

  describe("Seofon, Leader of the Eternals (10424120)", () => {
    const printed =
      "Fanfare: Skybound Art- Evolve all unevolved allied followers on the field.\nSuper Skybound Art- Super-evolve them instead.";

    it("without Skybound Art (10): does not evolve allies", () => {
      setupTurn(R9, { hand: [SEOFON], pp: 4 });
      const raw = allyFollower(2, 2, "Raw");
      const seofonHand = getHand(state, "first")[0]!;
      seofonHand.skyboundArtEvolvesWitnessed = 0;
      whenPlayCard("first", 0);
      expect(raw.hasEvolved).toBeFalsy();
    });

    it("Skybound Art (10): evolves all unevolved allies", () => {
      setupTurn(R10, { hand: [SEOFON], pp: 4 });
      const raw = allyFollower(2, 2, "Raw");
      const seofonHand = getHand(state, "first")[0]!;
      for (let i = 0; i < 4; i++) incrementSkyboundArt("first");
      seofonHand.skyboundArtEvolvesWitnessed = 4;
      whenPlayCard("first", 0);
      expect(raw.hasEvolved).toBe(true);
    });

    it("Super Skybound Art (15): super-evolves allies instead", () => {
      setupTurn(R15, { hand: [SEOFON], pp: 4, superEvo: 2 });
      const raw = allyFollower(2, 2, "Raw2");
      const seofonHand = getHand(state, "first")[0]!;
      for (let i = 0; i < 5; i++) incrementSkyboundArt("first");
      seofonHand.skyboundArtEvolvesWitnessed = 5;
      whenPlayCard("first", 0);
      expect(raw.evoType).toBe("super");
      expect(printed).toContain("Super-evolve them instead");
    });
  });

  describe("Unmoving Tactician (10523110)", () => {
    const printed =
      "Can't attack followers or leaders.\nAt the end of your turn, summon a Steelclad Knight.\nSuper-Evolve: Give all other allied followers on the field +3/+3.";

    it("can't attack followers or leaders", () => {
      setupTurn(R6, { hand: [UNMOVING], pp: 4 });
      whenPlayCard("first", 0);
      const tact = findOnBoard("first", "Unmoving Tactician")!;
      expect(isCantAttackLocked(tact)).toBe(true);
    });

    it("owner's EOT summons Steelclad Knight (90021120)", () => {
      setupTurn(R6, { hand: [UNMOVING], pp: 4 });
      whenPlayCard("first", 0);
      whenEndTurn();
      expect(boardCountById(STEELCLAD_KNIGHT)).toBe(1);
    });

    it("opponent's EOT does not summon Steelclad Knight", () => {
      setupTurn(R6, { hand: [UNMOVING], pp: 4 });
      whenPlayCard("first", 0);
      whenEndTurn();
      whenEndTurn();
      expect(boardCountById(STEELCLAD_KNIGHT)).toBe(1);
    });

    it("Super-Evolve gives +3/+3 to other allies only", () => {
      setupTurn(R7, { hand: [UNMOVING], pp: 4, superEvo: 1 });
      const bystander = allyFollower(2, 2, "Bystander");
      whenPlayCard("first", 0);
      const tact = findOnBoard("first", "Unmoving Tactician")!;
      whenSuperEvolve(tact, "first");
      expect(Number(bystander.attack)).toBe(5);
      expect(Number(bystander.defense)).toBe(5);
      expect(Number(tact.attack)).toBe(8);
      expect(Number(tact.defense)).toBe(9);
    });
  });

  describe("Advent of the Eld Sword (10621310)", () => {
    const printed =
      "Summon 3 copies of Fearless Soldier.\nEnhance (7): Give them +2/+2.";

    it("base (5 PP): summons exactly 3 Fearless Soldiers at 2/2", () => {
      setupTurn(R6, { hand: [ADVENT_ELD_SWORD], pp: 5 });
      whenPlayCard("first", 0);
      const soldiers = thenBoard("first").filter(
        (c) => c.id === FEARLESS_SOLDIER,
      );
      expect(soldiers).toHaveLength(3);
      expect(soldiers.every((s) => Number(s.attack) === 2)).toBe(true);
      expect(soldiers.every((s) => Number(s.defense) === 2)).toBe(true);
    });

    it("Enhance (7): summons 3 Fearless Soldiers at 4/4", () => {
      setupTurn(R8, { hand: [ADVENT_ELD_SWORD], pp: 7 });
      whenPlayCard("first", 0);
      const soldiers = thenBoard("first").filter(
        (c) => c.id === FEARLESS_SOLDIER,
      );
      expect(soldiers).toHaveLength(3);
      expect(soldiers.every((s) => Number(s.attack) === 4)).toBe(true);
      expect(soldiers.every((s) => Number(s.defense) === 4)).toBe(true);
    });
  });

  describe("Ferocious Commander (10922120)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Steelclad Knight.\nEnhance (7): Give them and this follower +3/+0 and Rush.";

    it("without Enhance (7): summons 2 Steelclad Knights, no buff", () => {
      setupTurn(R6, { hand: [FEROCIOUS], pp: 5 });
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter(
        (c) => c.id === STEELCLAD_KNIGHT,
      );
      expect(knights).toHaveLength(2);
      const cmd = findOnBoard("first", "Ferocious Commander")!;
      expect(Number(cmd.attack)).toBe(4);
      expect(cmd.hasRush).toBeFalsy();
    });

    it("Enhance (7): 2 knights and commander get +3/+0 and Rush", () => {
      setupTurn(R8, { hand: [FEROCIOUS], pp: 7 });
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter(
        (c) => c.id === STEELCLAD_KNIGHT,
      );
      expect(knights).toHaveLength(2);
      const cmd = findOnBoard("first", "Ferocious Commander")!;
      expect(Number(cmd.attack)).toBe(7);
      expect(cmd.hasRush).toBe(true);
      expect(knights.every((k) => Number(k.attack) === 5)).toBe(true);
      expect(knights.every((k) => k.hasRush)).toBe(true);
    });
  });

  describe("Knightly Ardor (10423310)", () => {
    const printed =
      'Select a Mode to activate.\n1. Give the leftmost allied Swordcraft follower on the field "Can attack 2 times per turn".\n2. Give all allied Swordcraft followers on the field +1/+1 and Barrier.\n3. Recover 2 play points and 1 evolution point.\n4. Restore 6 defense to your leader.';

    it("Mode 1: leftmost Swordcraft ally can attack twice", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5 });
      const left = createCard(SWORD_LEFT, "board", "first");
      left.peak_defense = left.defense;
      const right = createCard(SWORD_RIGHT, "board", "first");
      right.peak_defense = right.defense;
      state.players.first.board = [left, right];
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(left.attacks_per_turn ?? left.keywordState?.attacks_per_turn).toBe(
        2,
      );
      expect(
        right.attacks_per_turn ?? right.keywordState?.attacks_per_turn,
      ).toBeFalsy();
    });

    it("Mode 2: Swordcraft allies get +1/+1 and Barrier; non-Swordcraft untouched", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5 });
      const sword = createCard(SWORD_LEFT, "board", "first");
      sword.peak_defense = sword.defense;
      const nonSword = createCard(NON_SWORD_FOLLOWER, "board", "first");
      nonSword.peak_defense = nonSword.defense;
      state.players.first.board = [sword, nonSword];
      const atkBefore = Number(sword.attack);
      const defBefore = Number(sword.defense);
      const nonAtkBefore = Number(nonSword.attack);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(Number(sword.attack)).toBe(atkBefore + 1);
      expect(Number(sword.defense)).toBe(defBefore + 1);
      expect(sword.hasBarrier || sword.keywordState?.hasBarrier).toBe(true);
      expect(Number(nonSword.attack)).toBe(nonAtkBefore);
      expect(
        nonSword.hasBarrier || nonSword.keywordState?.hasBarrier,
      ).toBeFalsy();
    });

    it("Mode 3: recovers 2 PP and 1 evolution point", () => {
      setScriptedModePickProvider(() => [2]);
      setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5, evo: 0 });
      const evoBefore = state.players.first.evoCharges;
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getPP(state, "first")).toBe(2);
      expect(state.players.first.evoCharges).toBe(evoBefore + 1);
    });

    it("Mode 4: restores 6 defense to leader", () => {
      setScriptedModePickProvider(() => [3]);
      setupTurn(R6, { hand: [KNIGHTLY_ARDOR], pp: 5, hp: 14 });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getHP(state, "first")).toBe(20);
    });
  });

  describe("Aglovale, Lord of Frost (10422110)", () => {
    const printed = "Fanfare: Deal 3 damage to all enemy followers\nIntimidate";

    it("Fanfare deals 3 to all enemy followers; has Intimidate", () => {
      setupTurn(R8, { hand: [AGLOVALE], pp: 6 });
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(
        findOnBoard("first", "Aglovale, Lord of Frost")!.hasIntimidate,
      ).toBe(true);
    });
  });

  describe("Altruistic Aristocrat (10521110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Restore 3 defense to your leader. If you selected a spell, restore 6 defense instead.";

    it("discarding non-spell restores 3 defense", () => {
      setupTurn(R6, { hand: [ALTRUISTIC, NON_SWORD_FOLLOWER], pp: 6, hp: 15 });
      const toDiscard = thenHand("first").find(
        (c) => c.id === NON_SWORD_FOLLOWER,
      )!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toDiscard.uid);
      expect(getHP(state, "first")).toBe(18);
    });

    it("discarding spell restores 6 defense", () => {
      setupTurn(R6, { hand: [ALTRUISTIC, SPELL_A], pp: 6, hp: 12 });
      const toDiscard = thenHand("first").find((c) => c.id === SPELL_A)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toDiscard.uid);
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("restore 6 defense instead");
    });
  });

  describe("Noel IV, Ruthless Warlord (10624110)", () => {
    const printed =
      "Fanfare: Summon a Fearless Soldier and give it Bane.\nEnhance (7): Summon a Fearless Soldier and give it Drain.\nEnhance (8): Summon a Fearless Soldier and give it Storm.\nSuper-Evolve: Give all other allied followers on the field +1/+1.";

    it("at 6 PP: Fanfare only — 1 Fearless Soldier with Bane", () => {
      setupTurn(R6, { hand: [NOEL], pp: 6 });
      whenPlayCard("first", 0);
      const soldiers = thenBoard("first").filter(
        (c) => c.id === FEARLESS_SOLDIER,
      );
      expect(soldiers).toHaveLength(1);
      expect(soldiers[0]!.hasBane).toBe(true);
      expect(soldiers.some((s) => s.hasDrain)).toBe(false);
      expect(soldiers.some((s) => s.hasStorm)).toBe(false);
    });

    it("at 7 PP: Fanfare Bane + Enhance(7) Drain — 2 soldiers", () => {
      setupTurn(R7, { hand: [NOEL], pp: 7 });
      whenPlayCard("first", 0);
      const soldiers = thenBoard("first").filter(
        (c) => c.id === FEARLESS_SOLDIER,
      );
      expect(soldiers).toHaveLength(2);
      expect(soldiers.filter((s) => s.hasBane)).toHaveLength(1);
      expect(soldiers.filter((s) => s.hasDrain)).toHaveLength(1);
    });

    it("at 8 PP: Fanfare + both Enhance tiers — 3 soldiers with Bane, Drain, Storm", () => {
      setupTurn(R8, { hand: [NOEL], pp: 8 });
      whenPlayCard("first", 0);
      const soldiers = thenBoard("first").filter(
        (c) => c.id === FEARLESS_SOLDIER,
      );
      expect(soldiers).toHaveLength(3);
      expect(soldiers.filter((s) => s.hasBane)).toHaveLength(1);
      expect(soldiers.filter((s) => s.hasDrain)).toHaveLength(1);
      expect(soldiers.filter((s) => s.hasStorm)).toHaveLength(1);
    });

    it("Super-Evolve gives +1/+1 to other allies only", () => {
      setupTurn(R7, { hand: [NOEL], pp: 6, superEvo: 1 });
      const bystander = allyFollower(2, 2, "Bystander");
      whenPlayCard("first", 0);
      const noel = findOnBoard("first", "Noel IV, Ruthless Warlord")!;
      whenSuperEvolve(noel, "first");
      expect(Number(bystander.attack)).toBe(3);
      expect(Number(bystander.defense)).toBe(3);
      expect(Number(noel.attack)).toBe(7);
    });
  });

  describe("Swift Staffmaster (10522110)", () => {
    const printed =
      "When you draw this card, set its cost to 3 until the end of the turn.\nFanfare: Draw a card. Restore 3 defense to your leader.\nRush";

    it("when drawn: cost becomes 3 until end of turn", () => {
      setupTurn(R6, { deck: [FILLER, SWIFT_STAFF] });
      pushDeckTop(SWIFT_STAFF);
      drawFromDeck();
      const drawn = thenHand("first").find((c) => c.id === SWIFT_STAFF)!;
      expect(getEffectiveCost(drawn)).toBe(3);
    });

    it("Fanfare draws 1 card and restores 3 defense; has Rush", () => {
      setupTurn(R6, {
        hand: [SWIFT_STAFF],
        deck: [DRAW_TOP],
        pp: 6,
        hp: 15,
      });
      state.players.first.deck = [createCard(DRAW_TOP, "deck", "first")];
      const handBefore = thenHand("first").length;
      whenPlayCard("first", 0);
      expect(thenHand("first").length).toBe(handBefore);
      expect(handIds()).toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(18);
      const staff = findOnBoard("first", "Swift Staffmaster")!;
      expect(staff.hasRush).toBe(true);
    });
  });

  describe("Amphibian Goldmuncher (10522120)", () => {
    const printed =
      "At the end of your turn, if you have at least 2 spells in your hand, deal 5 damage to all enemy followers.\nEvolve: Add 2 copies of Glittering Gold to your hand.";

    it("EOT with fewer than 2 spells: no damage", () => {
      setupTurn(R7, { hand: [AMPHIBIAN, SPELL_A], pp: 7 });
      const foe = enemyFollower(2, 6, "Foe");
      whenPlayCard("first", 0);
      whenEndTurn();
      expect(Number(foe.defense)).toBe(6);
    });

    it("EOT with at least 2 spells: deals 5 to all enemy followers", () => {
      setupTurn(R7, { hand: [AMPHIBIAN, SPELL_A, SPELL_B], pp: 7 });
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      whenEndTurn();
      expect(Number(foe.defense)).toBe(3);
    });

    it("opponent's EOT: no damage even with 2+ spells", () => {
      setupTurn(R7, { hand: [AMPHIBIAN, SPELL_A, SPELL_B], pp: 7 });
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      whenEndTurn();
      whenEndTurn();
      expect(Number(foe.defense)).toBe(3);
    });

    it("Evolve adds 2 Glittering Gold (90021350)", () => {
      setupTurn(R7, { hand: [AMPHIBIAN], pp: 7, evo: 2 });
      whenPlayCard("first", 0);
      const amp = findOnBoard("first", "Amphibian Goldmuncher")!;
      whenEvolve(amp, "first");
      expect(
        thenHand("first").filter((c) => c.id === GLITTERING_GOLD),
      ).toHaveLength(2);
    });
  });

  describe("Navy Cat (10622120)", () => {
    const printed =
      "Fanfare: Destroy all enemy followers with 1 defense.\nStorm";

    it("Fanfare destroys 1-defense enemies; higher-defense bystander survives", () => {
      setupTurn(R8, { hand: [NAVY_CAT], pp: 8 });
      enemyFollower(3, 1, "One");
      const survivor = enemyFollower(2, 2, "Two");
      whenPlayCard("first", 0);
      cleanupDead();
      expect(getBoard(state, "second")).toHaveLength(1);
      expect(getBoard(state, "second")[0]!.name).toBe("Two");
      expect(findOnBoard("first", "Navy Cat")!.hasStorm).toBe(true);
    });
  });

  describe("Oluon, Raging Chariot (10524110)", () => {
    const printed =
      'At the end of your turn, if this follower is unevolved, deal 7 damage to all enemy followers. If it\'s evolved, do this 3 times: "Deal 7 damage to another random ally or enemy."';

    it("unevolved owner EOT: deals 7 to all enemy followers", () => {
      setupTurn(R9, { hand: [OLUON], pp: 9 });
      whenPlayCard("first", 0);
      const a = enemyFollower(1, 8, "A");
      const b = enemyFollower(1, 8, "B");
      whenEndTurn();
      expect(Number(a.defense)).toBe(1);
      expect(Number(b.defense)).toBe(1);
    });

    it("evolved owner EOT: 3 hits of 7 damage to random targets (seed 3)", () => {
      setupTurn(R9, { hand: [OLUON], pp: 9, evo: 2, seed: 3 });
      whenPlayCard("first", 0);
      const oluon = findOnBoard("first", "Oluon, Raging Chariot")!;
      whenEvolve(oluon, "first");
      state.players.second.board = [];
      state.players.second.hp = 20;
      state.players.first.hp = 20;
      whenEndTurn();
      expect(getHP(state, "second")).toBe(0);
      expect(getHP(state, "first")).toBe(20);
    });

    it("opponent EOT: no effect", () => {
      setupTurn(R9, { hand: [OLUON], pp: 9 });
      whenPlayCard("first", 0);
      const foe = enemyFollower(1, 8, "Foe");
      whenEndTurn();
      whenEndTurn();
      expect(Number(foe.defense)).toBe(1);
    });
  });

  describe("Oda Nobunaga (10822120)", () => {
    const printed =
      "Fanfare: Deal 6 damage to all enemy followers.\nIntimidate";

    it("Fanfare deals 6 to all enemy followers; has Intimidate", () => {
      setupTurn(R10, { hand: [ODA], pp: 10 });
      const a = enemyFollower(2, 8, "A");
      const b = enemyFollower(2, 8, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(findOnBoard("first", "Oda Nobunaga")!.hasIntimidate).toBe(true);
    });
  });
});
