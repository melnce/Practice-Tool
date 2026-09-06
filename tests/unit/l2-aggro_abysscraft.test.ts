/**
 * L2 real-card tests — Aggro Abysscraft deck (14 cards).
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
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const LILITH_CUTIE = "10851120";
const LILITH_SUCCUBUS = "10052110";
const MONSTER_LITTERATEUR = "10501110";
const DEVIOUS_MUMMY = "10051130";
const LIMIL = "10851130";
const REVERENT_DEMON = "10651110";
const RUTHLESS_BLITZER = "10951110";
const TYRANNICAL_FISTS = "10552310";
const BAAL = "10452130";
const HARK = "10753310";
const ANISAGE = "10851110";
const SUZY = "10853110";
const RAMPAGING_COMMANDER = "10953110";
const GARODETH = "10954120";

const BAT = "90051120";
const DRAW_TOP = "10052110";
const DRAW_DEEP = "10051130";
const HAND_FOLLOWER = "10161120";
const HAND_SPELL = "10131310";
const ONE_COST_ALLY = "10012110";

const R3 = 3;
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
    active?: "first" | "second";
    hp?: number;
    secondHp?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHp !== undefined) b = b.withSecondHP(opts.secondHp);
  b.build();
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

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

describe("L2 — Aggro Abysscraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Lilith, Devilish Cutie (10851120)", () => {
    const printed =
      "Strike: Deal 1 damage to both leaders.\nLast Words: Add a Bat to your hand.";

    it("Strike deals 1 damage to both leaders when attacking a follower", () => {
      setupTurn(R5);
      enemyFollower(1, 5, "Blocker");
      const lilith = createCard(LILITH_CUTIE, "board", "first");
      applyKeywordsFromList(lilith);
      lilith.can_attack = true;
      lilith.justPlayed = false;
      lilith.peak_defense = lilith.defense;
      state.players.first.board = [lilith];

      const hpSelfBefore = getHP(state, "first");
      const hpEnemyBefore = getHP(state, "second");
      attackFollower(0, 0, "first", "second");

      expect(getHP(state, "first")).toBe(hpSelfBefore - 1);
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 1);
      expect(printed).toContain("both leaders");
    });

    it("Last Words adds Bat (90051120) to hand", () => {
      setupTurn(R3);
      const lilith = createCard(LILITH_CUTIE, "board", "first");
      applyKeywordsFromList(lilith);
      lilith.defense = 0;
      state.players.first.board = [lilith];

      cleanupDead();
      expect(handIds()).toContain(BAT);
      expect(handIds()).not.toContain(LILITH_CUTIE);
      expect(printed).toContain("Add a Bat");
    });
  });

  describe("Lilith, Enchanting Succubus (10052110)", () => {
    const printed = "Last Words: Add a Bat to your hand.";

    it("Last Words adds Bat (90051120) to hand", () => {
      setupTurn(R3);
      const lilith = createCard(LILITH_SUCCUBUS, "board", "first");
      applyKeywordsFromList(lilith);
      lilith.defense = 0;
      state.players.first.board = [lilith];

      cleanupDead();
      expect(handIds()).toContain(BAT);
      expect(handIds()).not.toContain(LILITH_SUCCUBUS);
      expect(printed).toContain("Add a Bat");
    });
  });

  describe("Monster Litterateur (10501110)", () => {
    const printed =
      "Fanfare: If there's another 1-base-cost card on the field, give this follower +1/+1.";

    it("alone on field: Fanfare does not buff", () => {
      setupTurn(R3, { hand: [MONSTER_LITTERATEUR], pp: 1 });
      whenPlayCard("first", 0);
      const lit = findOnBoard("first", "Monster Litterateur")!;
      expect(Number(lit.attack)).toBe(1);
      expect(Number(lit.defense)).toBe(1);
      expect(printed).toContain("another 1-base-cost card");
    });

    it("with another 1-base-cost ally on field: Fanfare buffs only self", () => {
      setupTurn(R3, { hand: [MONSTER_LITTERATEUR], pp: 1 });
      const other = createCard(ONE_COST_ALLY, "board", "first");
      other.peak_defense = other.defense;
      state.players.first.board = [other];
      whenPlayCard("first", 0);
      const lit = findOnBoard("first", "Monster Litterateur")!;
      expect(Number(lit.attack)).toBe(2);
      expect(Number(lit.defense)).toBe(2);
      expect(Number(other.attack)).toBe(1);
      expect(Number(other.defense)).toBe(1);
      expect(printed).toContain("+1/+1");
    });
  });

  describe("Devious Lesser Mummy (10051130)", () => {
    const printed = "Fanfare: Necromancy (4) - Give this follower Storm.";

    it("with Necromancy (4): grants Storm and consumes 4 shadows", () => {
      setupTurn(R5, { hand: [DEVIOUS_MUMMY], pp: 2 });
      state.players.first.shadows = 4;
      whenPlayCard("first", 0);
      const mummy = findOnBoard("first", "Devious Lesser Mummy")!;
      expect(mummy.hasStorm).toBe(true);
      expect(state.players.first.shadows).toBe(0);
      expect(printed).toContain("Necromancy (4)");
    });

    it("without Necromancy (4): does not grant Storm", () => {
      setupTurn(R5, { hand: [DEVIOUS_MUMMY], pp: 2 });
      state.players.first.shadows = 3;
      whenPlayCard("first", 0);
      const mummy = findOnBoard("first", "Devious Lesser Mummy")!;
      expect(mummy.hasStorm).toBeFalsy();
      expect(state.players.first.shadows).toBe(3);
      expect(printed).toContain("Storm");
    });
  });

  describe("Limil, Devilish Bunny (10851130)", () => {
    const printed =
      "Fanfare: If your leader's defense is higher than the enemy leader's defense, summon 2 copies of Bat.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare ON: leader defense higher summons 2 Bats (90051120)", () => {
      setupTurn(R3, { hand: [LIMIL], pp: 2, hp: 15, secondHp: 10 });
      whenPlayCard("first", 0);
      const bats = thenBoard("first").filter((c) => c.id === BAT);
      expect(bats).toHaveLength(2);
      expect(printed).toContain("summon 2 copies of Bat");
    });

    it("Fanfare OFF: leader defense not higher summons no Bats", () => {
      setupTurn(R3, { hand: [LIMIL], pp: 2, hp: 10, secondHp: 15 });
      whenPlayCard("first", 0);
      expect(thenBoard("first").filter((c) => c.id === BAT)).toHaveLength(0);
      expect(findOnBoard("first", "Limil, Devilish Bunny")).toBeTruthy();
      expect(printed).toContain("higher than the enemy leader");
    });

    it("Evolve replicates Fanfare when condition holds", () => {
      setupTurn(R5, { hand: [LIMIL], pp: 2, hp: 15, secondHp: 10 });
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      const limil = findOnBoard("first", "Limil, Devilish Bunny")!;
      const batsBefore = thenBoard("first").filter((c) => c.id === BAT).length;
      whenEvolve(limil, "first");
      expect(thenBoard("first").filter((c) => c.id === BAT).length).toBe(
        batsBefore + 2,
      );
      expect(printed).toContain("Replicate");
    });
  });

  describe("Reverent Demon (10651110)", () => {
    const printed = "Last Words: Draw a card. Deal 1 damage to your leader.";

    it("Last Words draws stacked deck card and deals 1 to your leader", () => {
      setupTurn(R5, {
        hand: [REVERENT_DEMON],
        deck: [DRAW_DEEP, DRAW_TOP],
        pp: 2,
      });
      state.players.first.hp = 20;
      whenPlayCard("first", 0);
      const demon = findOnBoard("first", "Reverent Demon")!;
      demon.defense = 0;
      cleanupDead();

      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(DRAW_DEEP);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("Draw a card");
      expect(printed).toContain("Deal 1 damage to your leader");
    });
  });

  describe("Ruthless Blitzer (10951110)", () => {
    const printed = "Fanfare: Deal 2 damage to both leaders.";

    it("Fanfare deals 2 damage to both leaders", () => {
      setupTurn(R5, { hand: [RUTHLESS_BLITZER], pp: 2 });
      const hpSelf = getHP(state, "first");
      const hpEnemy = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpSelf - 2);
      expect(getHP(state, "second")).toBe(hpEnemy - 2);
      expect(printed).toContain("both leaders");
    });
  });

  describe("Tyrannical Fists (10552310)", () => {
    const printed = "Deal 3 damage to all leaders with the lowest defense.";

    it("damages only the leader with strictly lower defense", () => {
      setupTurn(R5, { hand: [TYRANNICAL_FISTS], pp: 2, hp: 20, secondHp: 10 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(20);
      expect(getHP(state, "second")).toBe(7);
      expect(printed).toContain("lowest defense");
    });

    it("damages both leaders when tied for lowest defense", () => {
      setupTurn(R5, { hand: [TYRANNICAL_FISTS], pp: 2, hp: 12, secondHp: 12 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(9);
      expect(getHP(state, "second")).toBe(9);
      expect(printed).toContain("all leaders");
    });

    it("damages your leader when your defense is strictly lower", () => {
      setupTurn(R5, { hand: [TYRANNICAL_FISTS], pp: 2, hp: 8, secondHp: 20 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(5);
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Baal, Elemental Resonance (10452130)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Give this follower and another random allied follower on the field +1/+1.\n2. Deal 3 damage to a random enemy follower.";

    it("Mode 1: Baal and another ally each gain +1/+1", () => {
      setupTurn(R6, { hand: [BAAL], pp: 3 });
      const ally = allyFollower("Ally", 2, 2);
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const baal = findOnBoard("first", "Baal, Elemental Resonance")!;
      expect(Number(baal.attack)).toBe(3);
      expect(Number(ally.attack)).toBe(3);
      expect(printed).toContain("+1/+1");
    });

    it("Mode 2: deals 3 damage to a random enemy follower", () => {
      setupTurn(R6, { hand: [BAAL], pp: 3 });
      const foe = enemyFollower(2, 5, "Foe");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Deal 3 damage");
    });
  });

  describe("Hark to the Night Song (10753310)", () => {
    const printed =
      "Deal 6 damage split between all enemy followers. Necromancy (6) - Deal 2 damage to the enemy leader.";

    it("with Necromancy (6): splits 6 among followers and deals 2 to enemy leader", () => {
      setupTurn(R5, { hand: [HARK], pp: 3 });
      state.players.first.shadows = 6;
      state.players.second.hp = 20;
      enemyFollower(2, 4, "A");
      enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      cleanupDead();
      const totalDef = getBoard(state, "second").reduce(
        (s, c) => s + (Number(c.defense) || 0),
        0,
      );
      expect(totalDef).toBeLessThanOrEqual(2);
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Necromancy (6)");
    });

    it("without Necromancy (6): splits damage but does not hit enemy leader", () => {
      setupTurn(R5, { hand: [HARK], pp: 3 });
      state.players.first.shadows = 4;
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 10, "Only");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(20);
      expect(Number(foe.defense)).toBe(4);
      expect(printed).toContain("enemy leader");
    });
  });

  describe("Anisage, Clear Resolve (10851110)", () => {
    const printed = "Storm\nIgnores Ward.";

    it("Storm: can attack the enemy leader the turn it is played", () => {
      setupTurn(R8, { hand: [ANISAGE], pp: 4 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const anisage = findOnBoard("first", "Anisage, Clear Resolve")!;
      expect(anisage.hasStorm).toBe(true);
      expect(anisage.can_attack).toBe(true);
      attackLeader(0, "first", "second");
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Storm");
    });

    it("Ignores Ward: can attack a non-Ward follower while Ward is present", () => {
      setupTurn(R8, { hand: [ANISAGE], pp: 4 });
      const ward = enemyFollower(1, 5, "Ward", { hasWard: true });
      const backliner = enemyFollower(1, 5, "Backliner");
      whenPlayCard("first", 0);
      attackFollower(0, 1, "first", "second");
      expect(Number(ward.defense)).toBe(5);
      expect(Number(backliner.defense)).toBe(3);
      expect(printed).toContain("Ignores Ward");
    });
  });

  describe("Suzy, Sincere Hexcaster (10853110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and give it -0/-3.\nEvolve: Select a follower in your hand and give it +3/+0.";

    it("Fanfare gives -0/-3 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [SUZY], pp: 4 });
      const target = enemyFollower(3, 5, "Target");
      const bystander = enemyFollower(3, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("-0/-3");
    });

    it("Evolve gives +3/+0 to selected hand follower only", () => {
      setupTurn(R6, {
        hand: [SUZY, HAND_FOLLOWER, HAND_SPELL],
        pp: 4,
      });
      const follower = thenHand("first").find((c) => c.id === HAND_FOLLOWER)!;
      const spell = thenHand("first").find((c) => c.id === HAND_SPELL)!;
      const atk0 = Number(follower.attack);
      enemyFollower(3, 3, "FanfareTarget");
      whenPlayCard("first", 0);
      if (state.pendingTargetEffect) {
        resolvePendingByUid(
          String(state.pendingTargetEffect.poolUids?.[0] ?? ""),
        );
      }
      const suzy = findOnBoard("first", "Suzy, Sincere Hexcaster")!;
      whenEvolve(suzy, "first");
      if (state.pendingTargetEffect) {
        resolvePendingByUid(String(follower.uid));
      }
      expect(Number(follower.attack)).toBe(atk0 + 3);
      expect(Number(spell.attack ?? 0)).toBe(0);
      expect(printed).toContain("+3/+0");
    });
  });

  describe("Rampaging Commander (10953110)", () => {
    const printed =
      "Fanfare: Deal 3 damage to all enemy followers. Deal 3 damage to both leaders.\nSuper-Evolve: Draw 2 cards. Deal 1 damage to both leaders.";

    it("Fanfare deals 3 to all enemy followers", () => {
      setupTurn(R8, { hand: [RAMPAGING_COMMANDER], pp: 6 });
      const foeA = enemyFollower(2, 5, "A");
      const foeB = enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(Number(foeA.defense)).toBe(2);
      expect(Number(foeB.defense)).toBe(2);
      expect(printed).toContain("all enemy followers");
    });

    it("Fanfare deals 3 damage to both leaders", () => {
      setupTurn(R8, { hand: [RAMPAGING_COMMANDER], pp: 6 });
      const hpSelf = getHP(state, "first");
      const hpEnemy = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpSelf - 3);
      expect(getHP(state, "second")).toBe(hpEnemy - 3);
      expect(printed).toContain("both leaders");
    });

    it("Super-Evolve draws 2 stacked deck cards", () => {
      const deckTop = "10111310";
      setupTurn(R10, {
        hand: [RAMPAGING_COMMANDER],
        // Last entry is top-of-deck for draws.
        deck: [DRAW_DEEP, DRAW_TOP, deckTop],
        pp: 6,
      });
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenPlayCard("first", 0);
      const commander = findOnBoard("first", "Rampaging Commander")!;
      const handBefore = handIds();
      whenSuperEvolve(commander, "first");
      expect(handIds()).toContain(deckTop);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(DRAW_DEEP);
      expect(handIds().length).toBeGreaterThan(handBefore.length);
      expect(printed).toContain("Draw 2 cards");
    });

    it("Super-Evolve deals 1 damage to both leaders", () => {
      setupTurn(R10, { hand: [RAMPAGING_COMMANDER], pp: 6 });
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const commander = findOnBoard("first", "Rampaging Commander")!;
      whenSuperEvolve(commander, "first");
      expect(getHP(state, "first")).toBe(16);
      expect(getHP(state, "second")).toBe(16);
      expect(printed).toContain("Deal 1 damage to both leaders");
    });
  });

  describe("Garodeth vs. Zeth (10954120)", () => {
    const printed =
      "Activates in hand. At the end of your turn, if your leader's defense is 12 or less, reduce the cost of this card by 1.\nFanfare: Select a Mode to activate.\n1. Give this follower Storm. Deal 2 damage to your leader.\n2. Give this follower Ward. Deal 8 damage to all enemy followers.";

    it("end of your turn with leader defense ≤12 reduces hand cost by 1", () => {
      setupTurn(R10, { hand: [GARODETH], pp: 8 });
      state.players.first.hp = 10;
      whenEndTurn();
      const garodeth = getHand(state, "first").find((c) => c.id === GARODETH)!;
      expect(Number(garodeth.cost)).toBe(7);
      expect(printed).toContain("reduce the cost");
    });

    it("end of your turn with leader defense >12 does not reduce cost", () => {
      setupTurn(R10, { hand: [GARODETH], pp: 8 });
      state.players.first.hp = 20;
      whenEndTurn();
      const garodeth = getHand(state, "first").find((c) => c.id === GARODETH)!;
      expect(Number(garodeth.cost)).toBe(8);
      expect(printed).toContain("12 or less");
    });

    it("opponent's end of turn does not reduce Garodeth hand cost", () => {
      setupTurn(R10, { hand: [GARODETH], pp: 8, active: "second" });
      state.players.first.hp = 10;
      whenEndTurn();
      const garodeth = getHand(state, "first").find((c) => c.id === GARODETH)!;
      expect(Number(garodeth.cost)).toBe(8);
    });

    it("Fanfare mode 1: grants Storm and deals 2 damage to your leader", () => {
      setupTurn(R10, { hand: [GARODETH], pp: 8 });
      state.players.first.hp = 20;
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const garodeth = findOnBoard("first", "Garodeth vs. Zeth")!;
      expect(garodeth.hasStorm).toBe(true);
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Storm");
    });

    it("Fanfare mode 2: grants Ward and deals 8 damage to all enemy followers", () => {
      setupTurn(R10, { hand: [GARODETH], pp: 8 });
      const foeA = enemyFollower(2, 10, "A");
      const foeB = enemyFollower(2, 10, "B");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const garodeth = findOnBoard("first", "Garodeth vs. Zeth")!;
      expect(garodeth.hasWard).toBe(true);
      expect(Number(foeA.defense)).toBe(2);
      expect(Number(foeB.defense)).toBe(2);
      expect(printed).toContain("Deal 8 damage");
    });
  });
});
